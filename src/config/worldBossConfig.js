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

// "Derrotado" (Ameaça Mundial V2 §8.1) — HP do personagem chegou a
// zero durante a luta contra o boss; sai do pool de alvos ativos
// (worldBossRuntimeService), mas a contribuição acumulada permanece.
const COMBAT_SESSION_STATUS = { ATIVO: "Ativo", ENCERRADA: "Encerrada", DERROTADO: "Derrotado" };

const PARTICIPATION_REWARDS_STATUS = { PENDING: "Pending", PROCESSING: "Processing", DONE: "Done" };

// TOP_DAMAGE (Ameaça Mundial V2 §11.1/§11.2) — vencedor oficial do
// ranking final, pago pelo mesmo pipeline idempotente de
// WorldBossRewardGrant (Etapa 9). Era OPTIONAL_TOP na V1 (nunca usado
// por nenhum service — grep confirmado); renomeado, não duplicado.
const REWARD_KIND = {
  DISCOVERY: "DISCOVERY",
  PARTICIPATION: "PARTICIPATION",
  FINAL_BLOW: "FINAL_BLOW",
  TOP_DAMAGE: "TOP_DAMAGE",
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
  // Bug relatado (01/10): sem contra-ataque do boss (decisão de design,
  // ver worldBossCombatService.js) e sem fila de turnos entre vários
  // jogadores (HP compartilhado, não é a pequena party/guilda), nada
  // segurava o jogador de clicar ataque/poder em sequência imediata —
  // "turno" virava só o round-trip da rede. Mesmo espírito do turno da
  // Aventura/Boss da Guilda (um gesto de cada vez, com um tempo mínimo
  // entre eles), mas pessoal — não espera fila de outros jogadores,
  // só o próprio personagem — por isso bem mais curto que o
  // BOSS_AO_VIVO_PRAZO_TURNO_MS (20s) da guilda, que é o PRAZO MÁXIMO
  // de uma fila de poucos membros, não o ritmo mínimo entre ações.
  "worldboss.player_action_cooldown_ms": 3000,
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
