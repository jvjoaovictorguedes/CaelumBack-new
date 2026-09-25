// Boss Global — Fase 2: Descoberta (§4/§5). registrarEncontroElegivel
// é chamado do MESMO ponto que já confirma uma vitória PvE legítima
// (combatController.concederVitoriaEResponder), nunca de um endpoint
// separado que o cliente pudesse acionar sozinho sem realmente vencer.
const { sequelize } = require("../config/database");
const WorldBossEvent = require("../models/WorldBossEvent");
const WorldBossConfigZone = require("../models/WorldBossConfigZone");
const gameSettingCache = require("./gameSettingCache");
const { EVENT_STATUS, GAME_SETTINGS_DEFAULT } = require("../config/worldBossConfig");

function inicioDaHoraAtual() {
  const agora = new Date();
  agora.setMinutes(0, 0, 0, 0);
  return agora;
}

// Telemetria agregada (§5.1/§5.2) — conta TODO encontro elegível
// (vitória PvE de zona, evento aberto ou não), pra manter o schema
// pronto pra evoluir do fallback simples pro cálculo dinâmico sem
// migration nova.
async function registrarMetricaElegivel(transaction) {
  await sequelize.query(
    `INSERT INTO world_boss_activity_metrics (window_start, encontros_elegiveis)
     VALUES (:windowStart, 1)
     ON CONFLICT (window_start) DO UPDATE
     SET encontros_elegiveis = world_boss_activity_metrics.encontros_elegiveis + 1;`,
    { replacements: { windowStart: inicioDaHoraAtual() }, transaction },
  );
}

// Encontro de Zona (id_area presente) só — o legado sem id_area nunca
// conta, mesma regra já aplicada a contratos/caçadas: não tem como
// validar zona elegível sem ele.
async function registrarEncontroElegivel(character, inimigo, transaction) {
  if (!inimigo?.id_area) return null;

  const habilitado = gameSettingCache.obter("worldboss.enabled", GAME_SETTINGS_DEFAULT["worldboss.enabled"]);
  if (!habilitado) return null;

  await registrarMetricaElegivel(transaction);

  // Só existe UM evento aberto por vez (índice único parcial no
  // banco) — se não há nada em DORMANT agora, não há o que descobrir.
  const evento = await WorldBossEvent.findOne({
    where: { status: EVENT_STATUS.DORMANT },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!evento) return null;

  // Zona elegível: config sem nenhuma zona cadastrada = qualquer zona
  // vale; com zonas cadastradas, só as listadas contam.
  const zonasDoConfig = await WorldBossConfigZone.findAll({
    where: { id_world_boss_config: evento.id_world_boss_config },
    transaction,
  });
  if (zonasDoConfig.length > 0 && !zonasDoConfig.some((zona) => zona.id_zone === inimigo.id_area)) {
    return null;
  }

  // discovery_progress/discovery_threshold são BIGINT — Sequelize
  // devolve como string; Number() é seguro aqui porque o range real
  // (dezenas/centenas de vitórias) nunca chega perto do limite de
  // precisão de um double.
  const progressoAtual = Number(evento.discovery_progress) + 1;
  const threshold = Number(evento.discovery_threshold);
  evento.discovery_progress = progressoAtual;

  if (progressoAtual < threshold) {
    await evento.save({ transaction });
    return null;
  }

  // Threshold atingido NESTA vitória — esta é a descoberta.
  // discoverer_character_id/discovery_zone_id são set-once: a trava
  // de linha (LOCK.UPDATE) acima + a checagem de status DORMANT
  // impedem que uma segunda vitória concorrente vire "descobridor".
  const segundos = gameSettingCache.obter(
    "worldboss.discovery_auto_awaken_seconds",
    GAME_SETTINGS_DEFAULT["worldboss.discovery_auto_awaken_seconds"],
  );
  const agora = new Date();
  evento.status = EVENT_STATUS.DISCOVERED;
  evento.discoverer_character_id = character.id;
  evento.discovery_zone_id = inimigo.id_area;
  evento.discovered_at = agora;
  evento.auto_awaken_at = new Date(agora.getTime() + segundos * 1000);
  await evento.save({ transaction });

  const snapshot = evento.config_snapshot ?? {};
  return {
    descoberto: true,
    event_id: evento.id,
    nome: snapshot.nome ?? null,
    mensagem_descoberta: snapshot.mensagem_descoberta ?? null,
  };
}

module.exports = { registrarEncontroElegivel };
