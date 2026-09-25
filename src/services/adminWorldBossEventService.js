// Painel Administrativo — Boss Global: operação do CICLO ATUAL
// (permissão events.manage — mesma já usada pelo resto do painel pra
// "eventos ao vivo", ver migration da Fase 1). Diferente de
// adminWorldBossService.js (catálogo, worldboss.manage): aqui é sobre
// o evento que está de fato rolando agora, com efeito imediato pra
// quem estiver jogando. Toda ação exige `motivo` — fica na auditoria
// pra sempre (mesmo padrão de adminGrantService.grantToCharacter).
const { sequelize } = require("../config/database");
const WorldBossEvent = require("../models/WorldBossEvent");
const Character = require("../models/Character");
const { registrarAcao } = require("./adminAuditService");
const worldBossStatusService = require("./worldBossStatusService");
const { emitGlobal } = require("../socket/worldBossSocket");
const { EVENT_STATUS, EVENT_STATUS_ABERTOS, GAME_SETTINGS_DEFAULT } = require("../config/worldBossConfig");
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
async function getStatusOperacional() {
  const evento = await WorldBossEvent.findOne({
    where: { status: [...EVENT_STATUS_ABERTOS, EVENT_STATUS.COOLDOWN] },
    order: [["id", "DESC"]],
  });
  if (!evento) return { status: "Nenhum" };
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
    discovery_zone_id: evento.discovery_zone_id,
    discovered_at: evento.discovered_at,
    auto_awaken_at: evento.auto_awaken_at,
    activated_at: evento.activated_at,
    final_blow_character_id: evento.final_blow_character_id,
    defeated_at: evento.defeated_at,
    next_eligible_at: evento.next_eligible_at,
    participation_rewards_status: evento.participation_rewards_status,
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
