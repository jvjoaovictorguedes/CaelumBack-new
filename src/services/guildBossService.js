// Boss da Guilda (spec "Aprimoramento do Sistema de Guildas" §29-§39) —
// substitui o antigo Portal de Guilda. Reaproveita a mecânica de dano
// coletivo (cada ataque usa o dano de verdade do personagem, servidor
// acumula vida_restante), mas troca promoção de Rank por: XP de Guilda
// fixo + recompensa individual em pool (25% igual + 75% por dano) +
// contador histórico — nunca promove mais Guild.rank (§13/§32: isso
// agora é só pelas Missões de Rank, ver guildRankProgressionService).
const { Op } = require("sequelize");
const Guild = require("../models/Guild");
const GuildMember = require("../models/GuildMember");
const Character = require("../models/Character");
const Class = require("../models/Class");
const GuildBossConfig = require("../models/GuildBossConfig");
const GuildBossAttempt = require("../models/GuildBossAttempt");
const GuildBossContribution = require("../models/GuildBossContribution");
const GuildTreasuryTransaction = require("../models/GuildTreasuryTransaction");
const { concederExperiencia } = require("./guildXpService");
const { adicionarExperiencia } = require("./experienceService");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("./equipmentBonusService");
const { comMultiplicadoresDeClasse, calcularDanoBasico, aplicarMitigacaoDeDefesa } = require("./combatFormulas");
const {
  inicioDoCicloSemanal,
  BOSS_FRACAO_IGUALITARIA,
  BOSS_FRACAO_PROPORCIONAL,
  membroEmCarencia,
} = require("../config/guildConfig");

// Cooldown por membro entre ataques ao MESMO boss — sem isso, uma
// pessoa sozinha conseguiria zerar o chefe batendo em loop. V2.0:
// atacar virou só a batalha ao vivo (o clique assíncrono antigo saiu
// da UI), e o cooldown de 20min é checado na entrada da sala
// (guildbossSocket.js), não mais por golpe individual — um pedido de
// jogador pra não ficar preso horas fora da luta em grupo.
const COOLDOWN_ATAQUE_MS = 20 * 60 * 1000;

function erroGuilda(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function expirarSeNecessario(tentativa, transaction, registrarLog) {
  if (tentativa.status === "Ativo" && new Date() > new Date(tentativa.expira_em)) {
    tentativa.status = "Expirado";
    await tentativa.save({ transaction });
    if (registrarLog) {
      await registrarLog(tentativa.id_guild, "boss_expirado", {
        detalhes: `Boss Rank ${tentativa.rank} expirou sem ser derrotado.`,
        transaction,
      });
    }
  }
  return tentativa;
}

// Quanto falta (em ms) pro membro poder entrar na sala ao vivo de novo
// — 0 se pode atacar agora. Só olha a tentativa ATIVA da guilda; sem
// tentativa em andamento não há cooldown pra checar (a entrada na sala
// já falha por outro motivo nesse caso).
async function tempoRestanteCooldown(idGuild, idPersonagem) {
  const tentativa = await GuildBossAttempt.findOne({ where: { id_guild: idGuild, status: "Ativo" } });
  if (!tentativa) return 0;

  const contribuicao = await GuildBossContribution.findOne({
    where: { id_guild_boss_attempt: tentativa.id, id_personagem: idPersonagem },
  });
  if (!contribuicao?.ultimo_ataque) return 0;

  const restante = COOLDOWN_ATAQUE_MS - (Date.now() - new Date(contribuicao.ultimo_ataque).getTime());
  return Math.max(0, restante);
}

async function obterStatus(idGuild) {
  const guild = await Guild.findByPk(idGuild, { attributes: ["id", "rank", "bosses_derrotados_total"] });
  if (!guild) throw erroGuilda("Guilda não encontrada.", 404);

  const chefe = await GuildBossConfig.findOne({ where: { rank: guild.rank } });
  const semanaInicio = inicioDoCicloSemanal();
  let tentativa = await GuildBossAttempt.findOne({ where: { id_guild: guild.id, semana_inicio: semanaInicio } });
  if (tentativa) tentativa = await expirarSeNecessario(tentativa, null, null);

  const contribuicoes = tentativa
    ? await GuildBossContribution.findAll({
        where: { id_guild_boss_attempt: tentativa.id },
        include: [{ model: Character, attributes: ["id", "nome"] }],
        order: [["dano_total", "DESC"]],
      })
    : [];

  return {
    rank_atual: guild.rank,
    bosses_derrotados_total: guild.bosses_derrotados_total,
    chefe,
    liberado_esta_semana: Boolean(tentativa),
    tentativa,
    contribuidores: contribuicoes.map((c) => ({
      personagem: c.Character ? { id: c.Character.id, nome: c.Character.nome } : null,
      dano_total: c.dano_total,
      numero_ataques: c.numero_ataques,
    })),
  };
}

// §30/§31/§48 — só o líder libera (regra fixa nesta versão, mesmo que a
// permissão liberar_boss exista pro futuro), custa Gold do Tesouro, e
// no máximo uma vez por semana (a unique index em GuildBossAttempt é a
// garantia final contra corrida — este check é só pra dar um erro
// legível antes de tentar inserir).
async function liberarBoss(idGuild, idPersonagem, transaction, { registrarLog, emitirEvento } = {}) {
  const guild = await Guild.findByPk(idGuild, { transaction, lock: transaction.LOCK.UPDATE });
  if (!guild) throw erroGuilda("Guilda não encontrada.", 404);
  if (guild.id_lider !== Number(idPersonagem)) {
    throw erroGuilda("Só o líder da guilda pode liberar o Boss.", 403);
  }

  const chefe = await GuildBossConfig.findOne({ where: { rank: guild.rank }, transaction });
  if (!chefe) throw erroGuilda("Nenhum Boss cadastrado para este Rank ainda.", 404);

  const semanaInicio = inicioDoCicloSemanal();
  const jaLiberado = await GuildBossAttempt.findOne({
    where: { id_guild: guild.id, semana_inicio: semanaInicio },
    transaction,
  });
  if (jaLiberado) throw erroGuilda("O Boss desta semana já foi liberado.", 409);

  if (guild.tesouro < chefe.custo_liberacao) {
    throw erroGuilda("O Tesouro não tem saldo suficiente para liberar o Boss.", 400);
  }

  guild.tesouro -= chefe.custo_liberacao;
  await guild.save({ transaction });

  await GuildTreasuryTransaction.create(
    {
      id_guild: guild.id,
      tipo: "Gasto",
      id_personagem: idPersonagem,
      valor: chefe.custo_liberacao,
      saldo_resultante: guild.tesouro,
      motivo: `Liberação do Boss da Guilda (Rank ${guild.rank})`,
    },
    { transaction },
  );

  const tentativa = await GuildBossAttempt.create(
    {
      id_guild: guild.id,
      id_guild_boss_config: chefe.id,
      rank: guild.rank,
      vida_total: chefe.vida_total,
      vida_restante: chefe.vida_total,
      semana_inicio: semanaInicio,
      expira_em: new Date(Date.now() + chefe.janela_horas * 60 * 60 * 1000),
      status: "Ativo",
    },
    { transaction },
  );

  if (registrarLog) {
    await registrarLog(guild.id, "boss_liberado", {
      responsavel: idPersonagem,
      detalhes: `Boss Rank ${guild.rank} liberado por ${chefe.custo_liberacao} de ouro do Tesouro.`,
      transaction,
    });
  }
  if (emitirEvento) emitirEvento(guild.id, "guild:treasury:update", { tesouro: guild.tesouro });

  return tentativa;
}

// Carrega e valida a tentativa (Ativo, não expirada) + a contribuição do
// personagem — compartilhado entre o ataque assíncrono (clique com
// cooldown) e o ataque ao vivo (guildBossSocket.js, sem cooldown, uma
// batida por turno já é o rate-limit natural).
async function carregarTentativaEContribuicao(idGuild, idPersonagem, transaction, { registrarLog } = {}) {
  const membro = await GuildMember.findOne({ where: { id_guild: idGuild, id_personagem: idPersonagem }, transaction });
  if (!membro) throw erroGuilda("Você não pertence a essa guilda.", 403);

  const tentativa = await GuildBossAttempt.findOne({
    where: { id_guild: idGuild, status: "Ativo" },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!tentativa) throw erroGuilda("Não há nenhum Boss da Guilda em andamento.", 404);

  if (new Date() > new Date(tentativa.expira_em)) {
    tentativa.status = "Expirado";
    await tentativa.save({ transaction });
    if (registrarLog) {
      await registrarLog(idGuild, "boss_expirado", {
        detalhes: `Boss Rank ${tentativa.rank} expirou sem ser derrotado.`,
        transaction,
      });
    }
    throw erroGuilda("O tempo deste Boss se esgotou.", 410);
  }

  const chefe = await GuildBossConfig.findByPk(tentativa.id_guild_boss_config, { transaction });
  const [contribuicao] = await GuildBossContribution.findOrCreate({
    where: { id_guild_boss_attempt: tentativa.id, id_personagem: idPersonagem },
    defaults: { dano_total: 0, numero_ataques: 0 },
    transaction,
  });

  return { tentativa, chefe, contribuicao };
}

// Aplica um golpe já calculado (dano >= 0) na tentativa + contribuição,
// persiste, distribui recompensa se zerou a vida, e emite o evento de
// atualização pra sala da guilda. Único ponto que escreve dano no boss —
// tanto atacarBoss (assíncrono) quanto guildBossSocket (ao vivo) passam
// por aqui, então as duas contagens de numero_ataques/dano_total nunca
// divergem.
async function aplicarGolpeNoBoss(idGuild, tentativa, chefe, contribuicao, dano, transaction, { registrarLog, emitirEvento } = {}) {
  contribuicao.dano_total = Number(contribuicao.dano_total) + dano;
  contribuicao.numero_ataques = Number(contribuicao.numero_ataques) + 1;
  contribuicao.ultimo_ataque = new Date();
  await contribuicao.save({ transaction });

  tentativa.vida_restante = Math.max(0, Number(tentativa.vida_restante) - dano);

  let derrotado = false;
  let recompensas = null;
  if (tentativa.vida_restante <= 0) {
    tentativa.status = "Vencido";
    derrotado = true;
    recompensas = await distribuirRecompensa(tentativa, chefe, transaction, { registrarLog });
  }
  await tentativa.save({ transaction });

  if (emitirEvento) {
    emitirEvento(idGuild, "guild:boss:update", {
      vida_restante: tentativa.vida_restante,
      vida_total: tentativa.vida_total,
      derrotado,
    });
  }

  return { dano, tentativa, derrotado, recompensas };
}

// §33/§34/§35/§36/§37/§38/§39 — dano coletivo (modo assíncrono, clique
// com cooldown por membro); ao zerar a vida, distribui recompensa (só
// se derrotado dentro da janela) e nunca promove Rank.
async function atacarBoss(idGuild, idPersonagem, transaction, { registrarLog, emitirEvento } = {}) {
  const { tentativa, chefe, contribuicao } = await carregarTentativaEContribuicao(idGuild, idPersonagem, transaction, {
    registrarLog,
  });

  if (contribuicao.ultimo_ataque) {
    const restanteMs = COOLDOWN_ATAQUE_MS - (Date.now() - new Date(contribuicao.ultimo_ataque).getTime());
    if (restanteMs > 0) {
      throw erroGuilda(`Aguarde ${Math.ceil(restanteMs / 60000)}min antes de atacar de novo.`, 429);
    }
  }

  const character = await Character.findByPk(idPersonagem, { include: [{ model: Class }], transaction });
  const bonusEquipamento = await buscarBonusDeAtributos(character.id, transaction);
  const jogadorEfetivo = comMultiplicadoresDeClasse(
    personagemComBonus(character.toJSON(), bonusEquipamento),
    character.Class,
  );
  const dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(jogadorEfetivo), chefe);

  return aplicarGolpeNoBoss(idGuild, tentativa, chefe, contribuicao, dano, transaction, { registrarLog, emitirEvento });
}

// V2.0 — golpe da batalha ao vivo (guildBossSocket.js): o dano já vem
// calculado de lá (mesmo motor de combate da Aventura em grupo,
// duelEngine.aplicarAcao, suporta ataque básico e poder) — aqui só
// persiste. Sem checagem de cooldown: um turno por vez já limita.
async function atacarBossAoVivo(idGuild, idPersonagem, dano, transaction, { registrarLog, emitirEvento } = {}) {
  const { tentativa, chefe, contribuicao } = await carregarTentativaEContribuicao(idGuild, idPersonagem, transaction, {
    registrarLog,
  });
  return aplicarGolpeNoBoss(idGuild, tentativa, chefe, contribuicao, dano, transaction, { registrarLog, emitirEvento });
}

// Nunca chamado fora de atacarBoss (vida_restante <= 0), e
// recompensa_distribuida garante que nunca roda duas vezes pro mesmo
// attempt mesmo se algo re-chamar isso por engano.
async function distribuirRecompensa(tentativa, chefe, transaction, { registrarLog }) {
  if (tentativa.recompensa_distribuida) return null;

  const guild = await Guild.findByPk(tentativa.id_guild, { transaction, lock: transaction.LOCK.UPDATE });

  // §37 — XP de Guilda FIXO por Rank do boss, nunca proporcional a dano.
  const { subiuNivel, niveisGanhos } = await concederExperiencia(guild, chefe.xp_guilda_concedido);
  guild.experiencia_total_ganha = Number(guild.experiencia_total_ganha) + chefe.xp_guilda_concedido;
  guild.bosses_derrotados_total += 1;
  await guild.save({ transaction });

  const todasContribuicoes = await GuildBossContribution.findAll({
    where: { id_guild_boss_attempt: tentativa.id, dano_total: { [Op.gt]: 0 } },
    transaction,
  });

  // §26/§27 — membro em carência não recebe recompensa do Boss, e nem
  // conta pro denominador de dano proporcional dos demais.
  const membros = await GuildMember.findAll({
    where: { id_personagem: todasContribuicoes.map((c) => c.id_personagem) },
    transaction,
  });
  const membroPorPersonagem = new Map(membros.map((m) => [m.id_personagem, m]));
  const elegiveis = todasContribuicoes.filter((c) => {
    const membro = membroPorPersonagem.get(c.id_personagem);
    return membro && !membroEmCarencia(membro);
  });

  const danoTotalElegivel = elegiveis.reduce((soma, c) => soma + Number(c.dano_total), 0);
  const recompensasPorPersonagem = [];

  if (elegiveis.length > 0) {
    const parteIgualDinheiro = (chefe.pool_dinheiro_total * BOSS_FRACAO_IGUALITARIA) / elegiveis.length;
    const parteIgualXp = (chefe.pool_xp_total * BOSS_FRACAO_IGUALITARIA) / elegiveis.length;

    for (const c of elegiveis) {
      const participacao = danoTotalElegivel > 0 ? Number(c.dano_total) / danoTotalElegivel : 0;
      const dinheiro = Math.floor(
        parteIgualDinheiro + chefe.pool_dinheiro_total * BOSS_FRACAO_PROPORCIONAL * participacao,
      );
      const xp = Math.floor(parteIgualXp + chefe.pool_xp_total * BOSS_FRACAO_PROPORCIONAL * participacao);

      if (dinheiro > 0) {
        await Character.increment("dinheiro", { by: dinheiro, where: { id: c.id_personagem }, transaction });
      }
      let resultadoXP = null;
      if (xp > 0) {
        resultadoXP = await adicionarExperiencia(c.id_personagem, xp, { transaction });
      }
      recompensasPorPersonagem.push({ idPersonagem: c.id_personagem, dinheiro, xp, nivel: resultadoXP?.nivel });
    }
  }

  // V2.0 — prêmio extra em ouro só pra quem causou mais dano na
  // tentativa, além da parte proporcional que já recebeu acima. Em
  // caso de empate no dano, fica com quem bateu primeiro (Array.reduce
  // só troca em ">" estrito) — resultado determinístico, sem sorteio.
  let maiorDano = null;
  if (elegiveis.length > 0 && chefe.premio_maior_dano > 0) {
    maiorDano = elegiveis.reduce((atual, c) => (Number(c.dano_total) > Number(atual.dano_total) ? c : atual));
    await Character.increment("dinheiro", {
      by: chefe.premio_maior_dano,
      where: { id: maiorDano.id_personagem },
      transaction,
    });
  }

  tentativa.recompensa_distribuida = true;

  if (registrarLog) {
    await registrarLog(tentativa.id_guild, "boss_derrotado", {
      detalhes: `Boss Rank ${tentativa.rank} derrotado — ${chefe.xp_guilda_concedido} XP de Guilda${subiuNivel ? ` (+${niveisGanhos} nível(is))` : ""}, ${elegiveis.length} participante(s) recompensado(s)${maiorDano ? `, prêmio de ${chefe.premio_maior_dano} ouro pro maior dano (personagem ${maiorDano.id_personagem})` : ""}.`,
      transaction,
    });
  }

  return {
    xpGuilda: chefe.xp_guilda_concedido,
    subiuNivel,
    niveisGanhos,
    participantes: recompensasPorPersonagem,
    premioMaiorDano: maiorDano
      ? { idPersonagem: maiorDano.id_personagem, ouro: chefe.premio_maior_dano }
      : null,
  };
}

module.exports = {
  obterStatus,
  liberarBoss,
  atacarBoss,
  atacarBossAoVivo,
  expirarSeNecessario,
  tempoRestanteCooldown,
};
