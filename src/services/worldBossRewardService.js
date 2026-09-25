// Boss Global — Fase 5: Recompensas (§16). Cada concessão é uma linha
// WorldBossRewardGrant com UNIQUE(event_id, character_id, reward_kind)
// — reprocessar (retry, recovery após restart) NUNCA credita duas
// vezes, porque toda concessão primeiro checa/cria essa linha e só
// segue se ela ainda não está "Granted".
//
// Cada personagem é processado numa transação PRÓPRIA, pequena — nunca
// na MESMA transação do abate (worldBossCombatService.executarAcao):
// um evento pode ter dezenas/centenas de contribuintes, e processar
// tudo isso na transação que já está seggurando a única linha ACTIVE
// do servidor inteiro travaria todo mundo esperando. Se o processo cair
// no meio do lote, WorldBossEvent.participation_rewards_status fica
// "Processing" — o scheduler (Fase 3) retoma dali no próximo tick, e
// cada grant já concedido continua "Granted" (idempotente).
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossContribution = require("../models/WorldBossContribution");
const WorldBossRewardGrant = require("../models/WorldBossRewardGrant");
const { concederOuro } = require("./goldService");
const { adicionarExperiencia } = require("./experienceService");
const { addStack } = require("./inventoryService");
const {
  EVENT_STATUS,
  REWARD_KIND,
  REWARD_GRANT_STATUS,
  PARTICIPATION_REWARDS_STATUS,
} = require("../config/worldBossConfig");

// findOrCreate + checagem de status é o que torna TUDO aqui idempotente
// — chamar de novo (retry, recovery) com um grant já "Granted" é um
// no-op garantido antes de qualquer efeito colateral (ouro/XP/item)
// acontecer de novo.
async function obterOuCriarGrantPendente(eventId, characterId, rewardKind, transaction) {
  const [grant, criado] = await WorldBossRewardGrant.findOrCreate({
    where: { event_id: eventId, character_id: characterId, reward_kind: rewardKind },
    defaults: {
      event_id: eventId,
      character_id: characterId,
      reward_kind: rewardKind,
      status: REWARD_GRANT_STATUS.PENDING,
    },
    transaction,
  });
  if (!criado && grant.status === REWARD_GRANT_STATUS.GRANTED) return null;
  return grant;
}

// §16.2 — gold_descoberta pro discoverer_character_id, uma vez.
async function concederDescobertaSeElegivel(evento, transaction) {
  if (!evento.discoverer_character_id) return;
  const grant = await obterOuCriarGrantPendente(evento.id, evento.discoverer_character_id, REWARD_KIND.DISCOVERY, transaction);
  if (!grant) return;

  const snapshot = evento.config_snapshot ?? {};
  const gold = snapshot.gold_descoberta ?? 0;
  const character = await Character.findByPk(evento.discoverer_character_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) {
    grant.status = REWARD_GRANT_STATUS.FAILED;
    await grant.save({ transaction });
    return;
  }
  if (gold > 0) {
    concederOuro(character, gold);
    await character.save({ transaction });
  }
  grant.status = REWARD_GRANT_STATUS.GRANTED;
  grant.payload_snapshot = { gold };
  grant.granted_at = new Date();
  await grant.save({ transaction });
}

// §16 — id_item_golpe_final pro final_blow_character_id, uma vez. É a
// recompensa especial de ter dado o golpe que zerou o HP — sempre um
// ITEM (o único campo de recompensa "de kill" que o catálogo tem),
// nunca ouro/XP fixo (isso já é coberto pela contribuição normal do
// mesmo personagem, concedida separadamente como PARTICIPATION).
async function concederGolpeFinalSeElegivel(evento, transaction) {
  if (!evento.final_blow_character_id) return;
  const grant = await obterOuCriarGrantPendente(evento.id, evento.final_blow_character_id, REWARD_KIND.FINAL_BLOW, transaction);
  if (!grant) return;

  const snapshot = evento.config_snapshot ?? {};
  const idItem = snapshot.id_item_golpe_final;
  if (idItem) {
    await addStack(evento.final_blow_character_id, idItem, 1, transaction);
  }
  grant.status = REWARD_GRANT_STATUS.GRANTED;
  grant.payload_snapshot = { id_item: idItem ?? null };
  grant.granted_at = new Date();
  await grant.save({ transaction });
}

// §16.2 — gold_participacao/xp_participacao por contribuinte, só quem
// bate min_dano_participacao (null no config = qualquer dano > 0 já
// qualifica).
async function concederParticipacaoSeElegivel(evento, contribuicao, transaction) {
  const danoTotal = Number(contribuicao.damage_total);
  if (danoTotal <= 0) return;
  const snapshot = evento.config_snapshot ?? {};
  const minimo = snapshot.min_dano_participacao;
  if (minimo !== null && minimo !== undefined && danoTotal < minimo) return;

  const grant = await obterOuCriarGrantPendente(
    evento.id,
    contribuicao.character_id,
    REWARD_KIND.PARTICIPATION,
    transaction,
  );
  if (!grant) return;

  const character = await Character.findByPk(contribuicao.character_id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!character) {
    grant.status = REWARD_GRANT_STATUS.FAILED;
    await grant.save({ transaction });
    return;
  }

  const gold = snapshot.gold_participacao ?? 0;
  const xp = snapshot.xp_participacao ?? 0;
  if (gold > 0) {
    concederOuro(character, gold);
  }
  // adicionarExperiencia salva o personagem no fim (ela mesma cuida de
  // persistir gold+XP juntos, igual combatController.concederVitoriaEResponder
  // já faz) — só precisa de um save explícito aqui se XP acabar não
  // sendo concedido (senão o gold ficaria só em memória).
  if (xp > 0) {
    await adicionarExperiencia(character.id, xp, { transaction, personagem: character });
  } else {
    await character.save({ transaction });
  }

  grant.status = REWARD_GRANT_STATUS.GRANTED;
  grant.payload_snapshot = { gold, xp };
  grant.granted_at = new Date();
  await grant.save({ transaction });
}

// Ponto de entrada — chamado uma vez logo após o Golpe Final (fora da
// transação de combate, "fire and forget") E periodicamente pelo
// scheduler como rede de segurança (recovery de um processo que caiu
// no meio do lote). Idempotente em qualquer quantidade de chamadas.
async function processarRecompensas(eventId) {
  const evento = await sequelize.transaction(async (transaction) => {
    const linha = await WorldBossEvent.findByPk(eventId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!linha) return null;
    if (linha.status !== EVENT_STATUS.DEFEATED) return null;
    if (linha.participation_rewards_status === PARTICIPATION_REWARDS_STATUS.DONE) return null;
    linha.participation_rewards_status = PARTICIPATION_REWARDS_STATUS.PROCESSING;
    await linha.save({ transaction });
    return linha;
  });
  if (!evento) return null;

  try {
    await sequelize.transaction((transaction) => concederDescobertaSeElegivel(evento, transaction));

    const contribuicoes = await WorldBossContribution.findAll({ where: { event_id: eventId } });
    for (const contribuicao of contribuicoes) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.transaction((transaction) => concederParticipacaoSeElegivel(evento, contribuicao, transaction));
    }

    await sequelize.transaction((transaction) => concederGolpeFinalSeElegivel(evento, transaction));

    await WorldBossEvent.update(
      { participation_rewards_status: PARTICIPATION_REWARDS_STATUS.DONE },
      { where: { id: eventId } },
    );
  } catch (error) {
    // participation_rewards_status FICA em "Processing" de propósito —
    // não volta pra "Pending" nem tenta um rollback manual. O scheduler
    // encontra essa linha no próximo tick e chama processarRecompensas
    // de novo; cada grant já "Granted" é pulado, então só o que faltou
    // é refeito.
    console.error(`[worldBossRewardService] falha ao processar recompensas do evento ${eventId}:`, error);
  }
  return evento;
}

// Recovery de startup/scheduler (§16 — "restart-recovery"): qualquer
// evento DEFEATED cujo lote não terminou (Pending — nunca nem
// começou — ou Processing — começou e não terminou, processo caiu no
// meio) é retomado.
async function retomarRecompensasPendentes() {
  const eventos = await WorldBossEvent.findAll({
    where: {
      status: EVENT_STATUS.DEFEATED,
      participation_rewards_status: [PARTICIPATION_REWARDS_STATUS.PENDING, PARTICIPATION_REWARDS_STATUS.PROCESSING],
    },
  });
  for (const evento of eventos) {
    // eslint-disable-next-line no-await-in-loop
    await processarRecompensas(evento.id);
  }
}

module.exports = { processarRecompensas, retomarRecompensasPendentes };
