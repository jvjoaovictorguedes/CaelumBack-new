// src/controllers/guildGateController.js
//
// Portal de Guilda: um chefe com pool de vida gigante (guild_rank_gates),
// derrubado ao longo de uma janela de tempo pelo dano somado de todos os
// membros (guild_gate_contributions) — nunca por uma pessoa só batendo
// em loop. "Quanto mais gente forte melhor pra passar" vem exatamente
// daqui: cada ataque usa o dano de verdade do personagem que ataca.
const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const Character = require("../models/Character");
const Class = require("../models/Class");
const GuildRankGate = require("../models/GuildRankGate");
const GuildGateAttempt = require("../models/GuildGateAttempt");
const GuildGateContribution = require("../models/GuildGateContribution");
const { temPermissao } = require("../services/guildPermissionService");
const { proximoRank, ehRankValido } = require("../services/rankService");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { comMultiplicadoresDeClasse, calcularDanoBasico, aplicarMitigacaoDeDefesa } = require("../services/combatFormulas");

// Cooldown por membro entre ataques ao MESMO portal — sem isso, uma
// pessoa sozinha conseguiria zerar o chefe batendo em loop, o que
// destruiria a ideia de "precisa da guilda inteira".
const COOLDOWN_ATAQUE_MS = 4 * 60 * 60 * 1000;

// Sem isso, o include: [{ model: Character }] em getStatus derruba com
// "GuildGateContribution is not associated to Character!".
GuildGateContribution.belongsTo(Character, { foreignKey: "id_personagem" });

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Expira uma tentativa "Ativo" cujo prazo já passou — chamado antes de
// qualquer leitura/ataque, pra nunca operar em cima de um portal que já
// devia ter fechado.
async function expirarSeNecessario(tentativa, transaction) {
  if (tentativa.status === "Ativo" && new Date() > new Date(tentativa.expira_em)) {
    tentativa.status = "Expirado";
    await tentativa.save({ transaction });
  }
  return tentativa;
}

// GET /guilds/:id/rank-gate
exports.getStatus = async (req, res) => {
  try {
    const guild = await Guild.findByPk(req.params.id, { attributes: ["id", "rank"] });
    if (!guild) return res.status(404).json({ message: "Guilda não encontrada." });

    const chefe = await GuildRankGate.findOne({ where: { rank: guild.rank } });
    let tentativaAtiva = await GuildGateAttempt.findOne({
      where: { id_guild: guild.id, status: "Ativo" },
    });
    if (tentativaAtiva) {
      tentativaAtiva = await expirarSeNecessario(tentativaAtiva, null);
      if (tentativaAtiva.status !== "Ativo") tentativaAtiva = null;
    }

    const contribuicoes = tentativaAtiva
      ? await GuildGateContribution.findAll({
          where: { id_guild_gate_attempt: tentativaAtiva.id },
          include: [{ model: Character, attributes: ["id", "nome"] }],
          order: [["dano_total", "DESC"]],
        })
      : [];

    res.status(200).json({
      status: "success",
      data: {
        rank_atual: guild.rank,
        proximo_rank: proximoRank(guild.rank),
        chefe,
        tentativa_ativa: tentativaAtiva,
        contribuidores: contribuicoes.map((c) => ({
          personagem: c.Character ? { id: c.Character.id, nome: c.Character.nome } : null,
          dano_total: c.dano_total,
        })),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar portal de guilda:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar portal de guilda." });
  }
};

// POST /guilds/:id/rank-gate/start
exports.iniciarPortal = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const membro = await GuildMember.findOne({
        where: { id_guild: req.params.id, id_personagem: idPersonagem },
        transaction,
      });
      if (!membro) throw erro("Você não pertence a essa guilda.", 403);

      const autorizado = await temPermissao(req.params.id, membro.cargo, "iniciar_portal");
      if (!autorizado) throw erro("Você não tem permissão para iniciar o portal da guilda.", 403);

      const guild = await Guild.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!guild) throw erro("Guilda não encontrada.", 404);

      if (!ehRankValido(guild.rank)) throw erro("Ranque da guilda inválido.", 400);
      const proximo = proximoRank(guild.rank);
      if (!proximo) throw erro("Esta guilda já está no ranque máximo (S++).", 400);

      const jaAtiva = await GuildGateAttempt.findOne({
        where: { id_guild: guild.id, status: "Ativo" },
        transaction,
      });
      if (jaAtiva && new Date() <= new Date(jaAtiva.expira_em)) {
        throw erro("Já existe um portal em andamento para esta guilda.", 409);
      }
      // Ativa mas já vencida a janela (ninguém checou ainda) — fecha
      // antes de abrir uma nova, pra não violar o índice único parcial.
      if (jaAtiva) {
        jaAtiva.status = "Expirado";
        await jaAtiva.save({ transaction });
      }

      const chefe = await GuildRankGate.findOne({ where: { rank: guild.rank }, transaction });
      if (!chefe) throw erro("Nenhum portal de guilda cadastrado para este ranque ainda.", 404);

      const tentativa = await GuildGateAttempt.create(
        {
          id_guild: guild.id,
          id_guild_rank_gate: chefe.id,
          rank: guild.rank,
          vida_total: chefe.vida_total,
          vida_restante: chefe.vida_total,
          expira_em: new Date(Date.now() + chefe.janela_horas * 60 * 60 * 1000),
          status: "Ativo",
        },
        { transaction },
      );

      return tentativa;
    });

    res.status(201).json({ status: "success", data: { tentativa: resultado } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao iniciar portal de guilda:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao iniciar o portal." });
  }
};

// POST /guilds/:id/rank-gate/attack
exports.atacarPortal = async (req, res) => {
  const idPersonagem = req.personagemAtual.id;
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const membro = await GuildMember.findOne({
        where: { id_guild: req.params.id, id_personagem: idPersonagem },
        transaction,
      });
      if (!membro) throw erro("Você não pertence a essa guilda.", 403);

      // Trava a tentativa (não a Guild inteira) — vários membros atacam
      // ao mesmo tempo, só serializa quem mexe na MESMA vida_restante.
      const tentativa = await GuildGateAttempt.findOne({
        where: { id_guild: req.params.id, status: "Ativo" },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!tentativa) throw erro("Não há nenhum portal de guilda em andamento.", 404);

      if (new Date() > new Date(tentativa.expira_em)) {
        tentativa.status = "Expirado";
        await tentativa.save({ transaction });
        throw erro("O tempo deste portal se esgotou.", 410);
      }

      const [contribuicao] = await GuildGateContribution.findOrCreate({
        where: { id_guild_gate_attempt: tentativa.id, id_personagem: idPersonagem },
        defaults: { dano_total: 0 },
        transaction,
      });

      if (contribuicao.ultimo_ataque) {
        const restanteMs = COOLDOWN_ATAQUE_MS - (Date.now() - new Date(contribuicao.ultimo_ataque).getTime());
        if (restanteMs > 0) {
          throw erro(`Aguarde ${Math.ceil(restanteMs / 60000)}min antes de atacar de novo.`, 429);
        }
      }

      const character = await Character.findByPk(idPersonagem, {
        include: [{ model: Class }],
        transaction,
      });
      const chefe = await GuildRankGate.findByPk(tentativa.id_guild_rank_gate, { transaction });

      const bonusEquipamento = await buscarBonusDeAtributos(character.id, transaction);
      const jogadorEfetivo = comMultiplicadoresDeClasse(
        personagemComBonus(character.toJSON(), bonusEquipamento),
        character.Class,
      );

      const dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(jogadorEfetivo), chefe);

      contribuicao.dano_total = Number(contribuicao.dano_total) + dano;
      contribuicao.ultimo_ataque = new Date();
      await contribuicao.save({ transaction });

      tentativa.vida_restante = Math.max(0, Number(tentativa.vida_restante) - dano);

      let rankPromovido = null;
      if (tentativa.vida_restante <= 0) {
        tentativa.status = "Vencido";

        const guild = await Guild.findByPk(tentativa.id_guild, { transaction, lock: transaction.LOCK.UPDATE });
        const proximo = proximoRank(guild.rank);
        if (proximo) {
          guild.rank = proximo;
          rankPromovido = proximo;
        }
        guild.tesouro += chefe.recompensa_tesouro;
        await guild.save({ transaction });

        // Recompensa flat pra todo mundo que contribuiu ao menos uma
        // vez nesta tentativa — não proporcional ao dano, pra não
        // desincentivar quem só tem uma tentativa de sobra hoje.
        if (chefe.recompensa_dinheiro_por_membro > 0) {
          const todosContribuidores = await GuildGateContribution.findAll({
            where: { id_guild_gate_attempt: tentativa.id },
            transaction,
          });
          await Character.increment(
            "dinheiro",
            {
              by: chefe.recompensa_dinheiro_por_membro,
              where: { id: { [Op.in]: todosContribuidores.map((c) => c.id_personagem) } },
              transaction,
            },
          );
        }
      }
      await tentativa.save({ transaction });

      return { dano, tentativa, rankPromovido };
    });

    res.status(200).json({
      status: "success",
      data: {
        dano_causado: resultado.dano,
        vida_restante: resultado.tentativa.vida_restante,
        vida_total: resultado.tentativa.vida_total,
        vencido: resultado.tentativa.status === "Vencido",
        rank_promovido: resultado.rankPromovido,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao atacar portal de guilda:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao atacar o portal." });
  }
};
