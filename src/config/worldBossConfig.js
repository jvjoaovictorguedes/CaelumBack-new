// Boss Global / Ameaça Mundial (Caelum_Boss_Global.docx) — constantes
// da máquina de estados e whitelists seguras. O banco NUNCA guarda
// status/estado livre executável: todo campo enum precisa bater com
// uma destas listas antes de ser aceito.

// §6 — ciclo de vida de um WorldBossEvent. Transições válidas:
// COOLDOWN -> DORMANT -> DISCOVERED -> ACTIVE -> DEFEATED
// DORMANT/DISCOVERED/ACTIVE -> CANCELLED (admin, motivo obrigatório)
const EVENT_STATUS = {
  COOLDOWN: "COOLDOWN",
  DORMANT: "DORMANT",
  DISCOVERED: "DISCOVERED",
  ACTIVE: "ACTIVE",
  DEFEATED: "DEFEATED",
  CANCELLED: "CANCELLED",
};

// Status "abertos" — no máximo um evento nesse conjunto por vez em
// todo o servidor (garantido pelo índice único parcial
// world_boss_events_um_aberto_idx no banco, não só aqui).
const EVENT_STATUS_ABERTOS = [EVENT_STATUS.DORMANT, EVENT_STATUS.DISCOVERED, EVENT_STATUS.ACTIVE];

const COMBAT_SESSION_STATUS = { ATIVO: "Ativo", ENCERRADA: "Encerrada" };

const PARTICIPATION_REWARDS_STATUS = { PENDING: "Pending", PROCESSING: "Processing", DONE: "Done" };

const REWARD_KIND = {
  DISCOVERY: "DISCOVERY",
  PARTICIPATION: "PARTICIPATION",
  FINAL_BLOW: "FINAL_BLOW",
  OPTIONAL_TOP: "OPTIONAL_TOP",
};

const REWARD_GRANT_STATUS = { PENDING: "Pending", GRANTED: "Granted", FAILED: "Failed" };

// §5.3 — "fallback simples": threshold sorteado uniformemente entre
// _min/_max quando o evento entra em DORMANT, em vez do cálculo
// dinâmico por taxa (§5.2, deliberadamente NÃO implementado ainda —
// o schema (discovery_progress/WorldBossActivityMetric) já fica
// pronto pra evoluir pra ele sem migration nova).
//
// §29 — GameSettings operacionais, com o mesmo default hardcoded
// usado como fallback por gameSettingCache.obter antes de qualquer
// admin salvar uma config (mesmo padrão de tavernConfig/spoilConfig).
const GAME_SETTINGS_DEFAULT = {
  "worldboss.enabled": true,
  "worldboss.cooldown_hours": 48,
  "worldboss.discovery_threshold_min": 30,
  "worldboss.discovery_threshold_max": 120,
  "worldboss.discovery_auto_awaken_seconds": 60,
  "worldboss.hp_broadcast_interval_ms": 1000,
  "worldboss.leaderboard_limit": 20,
  "worldboss.participation_rewards_enabled": true,
};

module.exports = {
  EVENT_STATUS,
  EVENT_STATUS_ABERTOS,
  COMBAT_SESSION_STATUS,
  PARTICIPATION_REWARDS_STATUS,
  REWARD_KIND,
  REWARD_GRANT_STATUS,
  GAME_SETTINGS_DEFAULT,
};
