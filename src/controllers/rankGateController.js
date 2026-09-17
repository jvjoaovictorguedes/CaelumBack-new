// src/controllers/rankGateController.js
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const RankGate = require("../models/RankGate");
const { adicionarExperiencia } = require("../services/experienceService");
const { simularPortal } = require("../services/rankGateService");
const { proximoRank, ehRankValido } = require("../services/rankService");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { comMultiplicadoresDeClasse } = require("../services/combatFormulas");
const { buscarPoderesDoPersonagem } = require("./pvpController");

const COOLDOWN_TENTATIVA_MS = 5 * 60 * 1000;

// GET /characters/:id/rank-gate — info do portal do ranque ATUAL do
// personagem (o que ele precisa vencer pra subir), sem gastar a
// tentativa. null quando já está no teto (S++, sem portal seguinte).
exports.getPortalAtual = async (req, res) => {
  try {
    const character = await Character.findByPk(req.params.id, {
      attributes: ["id", "rank", "ultima_tentativa_rank_gate"],
    });
    if (!character) {
      return res.status(404).json({ message: "Personagem não encontrado." });
    }

    const chefe = await RankGate.findOne({ where: { rank: character.rank } });
    const proximo = proximoRank(character.rank);
    const cooldownRestanteMs = character.ultima_tentativa_rank_gate
      ? Math.max(
          0,
          COOLDOWN_TENTATIVA_MS - (Date.now() - new Date(character.ultima_tentativa_rank_gate).getTime()),
        )
      : 0;

    res.status(200).json({
      status: "success",
      data: {
        rank_atual: character.rank,
        proximo_rank: proximo,
        portal: chefe,
        pode_tentar: Boolean(chefe) && cooldownRestanteMs === 0,
        cooldown_restante_ms: cooldownRestanteMs,
      },
    });
  } catch (error) {
    console.error("Erro ao buscar portal de ranque:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar portal." });
  }
};

// POST /characters/:id/rank-gate/attempt — resolve o portal inteiro numa
// tacada só (ver rankGateService.simularPortal) e, se vencer, promove
// character.rank pro próximo da escada.
exports.tentarPortal = async (req, res) => {
  try {
    const resultado = await sequelize.transaction(async (transaction) => {
      const character = await Character.findByPk(req.params.id, {
        include: [{ model: Class }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Character },
      });
      if (!character) {
        throw Object.assign(new Error("Personagem não encontrado."), { statusCode: 404 });
      }

      if (!ehRankValido(character.rank)) {
        throw Object.assign(new Error("Ranque do personagem inválido."), { statusCode: 400 });
      }

      const proximo = proximoRank(character.rank);
      if (!proximo) {
        throw Object.assign(
          new Error("Este personagem já está no ranque máximo (S++)."),
          { statusCode: 400 },
        );
      }

      if (character.encontro_pve) {
        throw Object.assign(
          new Error("Termine o combate PvE em andamento antes de tentar o portal."),
          { statusCode: 409 },
        );
      }

      if (character.ultima_tentativa_rank_gate) {
        const restanteMs =
          COOLDOWN_TENTATIVA_MS - (Date.now() - new Date(character.ultima_tentativa_rank_gate).getTime());
        if (restanteMs > 0) {
          throw Object.assign(
            new Error(`Aguarde ${Math.ceil(restanteMs / 1000)}s antes de tentar o portal de novo.`),
            { statusCode: 429 },
          );
        }
      }

      const chefe = await RankGate.findOne({ where: { rank: character.rank }, transaction });
      if (!chefe) {
        throw Object.assign(
          new Error("Nenhum portal cadastrado para este ranque ainda."),
          { statusCode: 404 },
        );
      }

      const bonusEquipamento = await buscarBonusDeAtributos(character.id, transaction);
      const jogadorEfetivo = comMultiplicadoresDeClasse(
        personagemComBonus(character.toJSON(), bonusEquipamento),
        character.Class,
      );
      const poderesJogador = await buscarPoderesDoPersonagem(character.id);

      const resultadoPortal = simularPortal({
        jogador: jogadorEfetivo,
        poderesJogador,
        chefe: chefe.toJSON(),
      });

      character.ultima_tentativa_rank_gate = new Date();
      character.vida_atual = resultadoPortal.vidaJogadorRestante;
      character.ultima_atualizacao_vida = new Date();

      let rankPromovido = null;
      if (resultadoPortal.venceu) {
        character.dinheiro += chefe.recompensa_dinheiro;
        character.rank = proximo;
        rankPromovido = proximo;
      }
      await character.save({ transaction });

      let resultadoXP = null;
      if (resultadoPortal.venceu && chefe.recompensa_xp > 0) {
        resultadoXP = await adicionarExperiencia(character.id, chefe.recompensa_xp, {
          transaction,
          personagem: character,
        });
      }

      return { resultadoPortal, chefe, rankPromovido, resultadoXP, character };
    });

    res.status(200).json({
      status: "success",
      data: {
        venceu: resultado.resultadoPortal.venceu,
        log: resultado.resultadoPortal.log,
        rank_promovido: resultado.rankPromovido,
        niveis_ganhos: resultado.resultadoXP?.niveisGanhos ?? 0,
        character: {
          vida_atual: resultado.character.vida_atual,
          dinheiro: resultado.character.dinheiro,
          rank: resultado.character.rank,
        },
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao tentar portal de ranque:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao tentar o portal." });
  }
};
