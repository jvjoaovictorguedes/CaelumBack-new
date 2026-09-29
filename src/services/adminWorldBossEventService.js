// Painel Administrativo — Boss Global: operação do CICLO ATUAL
// (permissão events.manage — mesma já usada pelo resto do painel pra
// "eventos ao vivo", ver migration da Fase 1). Diferente de
// adminWorldBossService.js (catálogo, worldboss.manage): aqui é sobre
// o evento que está de fato rolando agora, com efeito imediato pra
// quem estiver jogando. Toda ação exige `motivo` — fica na auditoria
// pra sempre (mesmo padrão de adminGrantService.grantToCharacter).
const { sequelize } = require("../config/database");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossCombatSession = require("../models/WorldBossCombatSession");
const Character = require("../models/Character");
const { registrarAcao } = require("./adminAuditService");
const worldBossStatusService = require("./worldBossStatusService");
const worldBossRankingService = require("./worldBossRankingService");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS, EVENT_STATUS_ABERTOS, COMBAT_SESSION_STATUS, GAME_SETTINGS_DEFAULT } = require("../config/worldBossConfig");
const gameSettingCache = require("./gameSettingCache");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function exigirMotivo(motivo) {
  if (!motivo || !motivo.trim()) {
    throw erro("motivo é obrigatório — toda ação sobre o ciclo atual fica registrada na auditoria com o porquê.");
  }
}

// Status OPERACIONAL — ao contrário de worldBossStatusService (público,
// nunca revela DORMANT/threshold/progress), este mostra TUDO: é uso
// exclusivo do painel admin, pra decidir se vale a pena forçar alguma
// transição.
// Ameaça Mundial V2 §13.7 — "Ciclo Atual" também é o monitor ao vivo do
// relógio de combate (Etapa 3/5/6), não só do ciclo de descoberta
// (Fase 3 original). Só acrescenta campos — nunca troca a leitura
// operacional já existente (§13.8: catálogo e operação continuam
// responsabilidades separadas, isso aqui só ENRIQUECE o mesmo status).
async function runtimeDeCombateV2(evento) {
  if (evento.status !== EVENT_STATUS.ACTIVE) return null;
  const snapshot = evento.config_snapshot ?? {};
  const hpMax = Number(evento.hp_max) || 0;
  const hpCurrent = Math.max(0, Number(evento.hp_current));
  const hpPercentual = hpMax > 0 ? (hpCurrent / hpMax) * 100 : 0;
  const fases = Array.isArray(snapshot.fases) ? snapshot.fases : [];
  const ordenadas = [...fases].sort((a, b) => a.hp_percentual_max - b.hp_percentual_max);
  const faseAtual = ordenadas.find((f) => hpPercentual <= f.hp_percentual_max) ?? ordenadas[ordenadas.length - 1] ?? null;

  const [ativos, derrotados, ranking] = await Promise.all([
    WorldBossCombatSession.count({ where: { event_id: evento.id, status: COMBAT_SESSION_STATUS.ATIVO } }),
    WorldBossCombatSession.count({ where: { event_id: evento.id, status: COMBAT_SESSION_STATUS.DERROTADO } }),
    worldBossRankingService.obterRanking({ eventId: evento.id, limit: 5 }),
  ]);

  const castPendente = evento.runtime_state?.cast_pendente ?? null;
  const proximaAcaoEmMs = evento.next_action_at ? new Date(evento.next_action_at).getTime() - Date.now() : null;

  return {
    mana_current: evento.mana_current,
    mana_maxima: snapshot.mana_maxima ?? null,
    boss_action_seq: evento.boss_action_seq,
    phase_action_seq: evento.phase_action_seq,
    furia_current_pct: Number(evento.furia_current_pct),
    fase_atual: faseAtual ? { ordem: faseAtual.ordem, nome_fase: faseAtual.nome_fase } : null,
    next_action_at: evento.next_action_at,
    proxima_acao_em_ms: proximaAcaoEmMs !== null ? Math.max(0, proximaAcaoEmMs) : null,
    cast_pendente: castPendente
      ? {
          power: castPendente.power_snapshot ? { id: castPendente.power_snapshot.id, nome: castPendente.power_snapshot.nome } : null,
          resolves_at: castPendente.resolves_at,
        }
      : null,
    status_boss: evento.runtime_state?.status_boss ?? [],
    participantes: { ativos, derrotados, total: ativos + derrotados },
    ranking_ao_vivo: ranking.top,
  };
}

async function getStatusOperacional() {
  const evento = await WorldBossEvent.findOne({
    where: { status: [...EVENT_STATUS_ABERTOS, EVENT_STATUS.COOLDOWN] },
    order: [["id", "DESC"]],
  });
  if (!evento) return { status: "Nenhum" };
  const [descobridor, golpeFinalPor] = await Promise.all([
    evento.discoverer_character_id ? Character.findByPk(evento.discoverer_character_id) : null,
    evento.final_blow_character_id ? Character.findByPk(evento.final_blow_character_id) : null,
  ]);
  return {
    id: evento.id,
    status: evento.status,
    id_world_boss_config: evento.id_world_boss_config,
    nome: evento.config_snapshot?.nome ?? null,
    hp_max: Number(evento.hp_max),
    hp_current: Number(evento.hp_current),
    discovery_threshold: evento.discovery_threshold !== null ? Number(evento.discovery_threshold) : null,
    discovery_progress: Number(evento.discovery_progress),
    discoverer_character_id: evento.discoverer_character_id,
    descobridor: descobridor ? { id: descobridor.id, nome: descobridor.nome } : null,
    discovery_zone_id: evento.discovery_zone_id,
    discovered_at: evento.discovered_at,
    auto_awaken_at: evento.auto_awaken_at,
    activated_at: evento.activated_at,
    final_blow_character_id: evento.final_blow_character_id,
    golpe_final_por: golpeFinalPor ? { id: golpeFinalPor.id, nome: golpeFinalPor.nome } : null,
    defeated_at: evento.defeated_at,
    next_eligible_at: evento.next_eligible_at,
    participation_rewards_status: evento.participation_rewards_status,
    // §13.7 — null pra qualquer status fora de ACTIVE (não faz sentido
    // "monitor de combate" pra um evento que ainda nem despertou).
    runtime_v2: await runtimeDeCombateV2(evento),
  };
}

async function emitirStatusAtualizado() {
  const status = await worldBossStatusService.obterStatusPublico();
  emitGlobal("worldboss:status", status);
}

// Força a passagem DORMANT -> DISCOVERED sem esperar o threshold real
// ser batido em combate — pra teste/demonstração/evento especial.
// characterId é opcional: sem ele, a Ameaça aparece "descoberta" sem
// um descobridor específico (discoverer_character_id null — nenhuma
// recompensa de descoberta é concedida nesse caso, já que ela é
// sempre por personagem).
async function forcarDescoberta({ characterId, motivo, idAdmin, req }) {
  exigirMotivo(motivo);
  const evento = await sequelize.transaction(async (transaction) => {
    const linha = await WorldBossEvent.findOne({
      where: { status: EVENT_STATUS.DORMANT },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!linha) throw erro("Não há nenhuma Ameaça Mundial em DORMANT pra forçar a descoberta.");

    if (characterId) {
      const personagem = await Character.findByPk(characterId, { transaction });
      if (!personagem) throw erro("Personagem não encontrado.", 404);
    }

    const segundos = gameSettingCache.obter(
      "worldboss.discovery_auto_awaken_seconds",
      GAME_SETTINGS_DEFAULT["worldboss.discovery_auto_awaken_seconds"],
    );
    const antes = linha.toJSON();
    const agora = new Date();
    linha.status = EVENT_STATUS.DISCOVERED;
    linha.discoverer_character_id = characterId ?? null;
    linha.discovered_at = agora;
    linha.auto_awaken_at = new Date(agora.getTime() + segundos * 1000);
    await linha.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "worldboss_forcar_descoberta",
      entidade: "WorldBossEvent",
      idEntidade: linha.id,
      dadosAntes: antes,
      dadosDepois: linha.toJSON(),
      motivo,
      req,
      transaction,
    });
    return linha;
  });

  await emitirStatusAtualizado();
  return evento;
}

// Força a passagem DISCOVERED -> ACTIVE sem esperar auto_awaken_at.
async function despertarManualmente({ motivo, idAdmin, req }) {
  exigirMotivo(motivo);
  const evento = await sequelize.transaction(async (transaction) => {
    const linha = await WorldBossEvent.findOne({
      where: { status: EVENT_STATUS.DISCOVERED },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!linha) throw erro("Não há nenhuma Ameaça Mundial em DISCOVERED pra despertar.");

    const antes = linha.toJSON();
    linha.status = EVENT_STATUS.ACTIVE;
    linha.activated_at = new Date();
    await linha.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "worldboss_despertar",
      entidade: "WorldBossEvent",
      idEntidade: linha.id,
      dadosAntes: antes,
      dadosDepois: linha.toJSON(),
      motivo,
      req,
      transaction,
    });
    return linha;
  });

  await emitirStatusAtualizado();
  return evento;
}

// Cancela o ciclo atual (qualquer status "aberto" OU um COOLDOWN
// parado) — também serve como "conserta evento travado": cancelar e
// deixar o scheduler agendar um ciclo novo do zero é o jeito seguro de
// destravar qualquer estado inconsistente, sem editar linhas na mão.
// Nunca cancela um DEFEATED (esse já terminou — usar as ferramentas de
// recompensa, não esta).
async function cancelarCicloAtual({ motivo, idAdmin, req }) {
  exigirMotivo(motivo);
  const evento = await sequelize.transaction(async (transaction) => {
    const linha = await WorldBossEvent.findOne({
      where: { status: [...EVENT_STATUS_ABERTOS, EVENT_STATUS.COOLDOWN] },
      order: [["id", "DESC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!linha) throw erro("Não há nenhum ciclo aberto ou em espera pra cancelar.");

    const antes = linha.toJSON();
    linha.status = EVENT_STATUS.CANCELLED;
    await linha.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "worldboss_cancelar_ciclo",
      entidade: "WorldBossEvent",
      idEntidade: linha.id,
      dadosAntes: antes,
      dadosDepois: linha.toJSON(),
      motivo,
      req,
      transaction,
    });
    return linha;
  });

  await emitirStatusAtualizado();
  return evento;
}

module.exports = {
  getStatusOperacional,
  forcarDescoberta,
  despertarManualmente,
  cancelarCicloAtual,
};
