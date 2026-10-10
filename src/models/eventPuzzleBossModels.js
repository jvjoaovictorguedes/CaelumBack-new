// Evento "O Coração da Máquina Celestial" — Fase 13: Boss Custódio do
// Meridiano (§"Boss Custódio do Meridiano" do breakdown de fases, task
// #205). 5 models consolidados num arquivo só, mesmo padrão de
// eventPuzzleModels.js/combatTypingModels.js — domínio novo, tabelas
// fortemente relacionadas.
//
// Clone estrutural do Guardião do Templo (TempleBossConfig/Phase/
// StatusResistance/Attempt/RewardGrant) — MESMA separação identidade/
// fases/resistências/tentativa/grant, reaproveitando os mesmos motores
// genéricos de combate (templeBossScalingService, duelEngine,
// monsterCombatAdapter — ver eventPuzzleBossCombatService.js). Duas
// diferenças deliberadas em relação ao Templo:
//
// 1. EventPuzzleBossConfig referencia id_event_definition (o Boss é
//    parte do TEMPLATE do evento, igual Blueprint) + id_blueprint_gatilho
//    (a sala cujo COMPLETED libera a luta — ver puzzleBlueprintService.
//    personagemCompletouBlueprint, nunca um campo boss_unlocked_at
//    paralelo); EventPuzzleBossAttempt referencia id_event_edition (a
//    tentativa pertence a uma EDIÇÃO concreta, não ao template) — reflete
//    a separação Definition/Edition que o Templo não tem.
// 2. Recompensa simplificada a ouro+xp fixos no primeiro clear (nunca um
//    catálogo de loot sorteável como temple_boss_reward_entries) — loot
//    temático rico é Fase 14 ("Recompensas temáticas do evento"),
//    deliberadamente fora do escopo desta fase.
const { DataTypes: D } = require("sequelize");
const { sequelize } = require("../config/database");

const timestamps = { createdAt: "createdAt", updatedAt: "updatedAt" };

const EventPuzzleBossConfig = sequelize.define(
  "EventPuzzleBossConfig",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event_definition: {
      type: D.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: "event_definitions", key: "id" },
    },
    id_monstro_base: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "AdventureMonsters", key: "id" },
    },
    // A sala que, uma vez COMPLETED pelo personagem, libera a luta —
    // nullable só pra nunca travar um Config criado antes da sala-gate
    // existir; sem isso a luta nunca é considerada desbloqueada (ver
    // eventPuzzleBossAttemptService.entrarOuRetomar).
    id_blueprint_gatilho: {
      type: D.INTEGER,
      allowNull: true,
      references: { model: "puzzle_blueprints", key: "id" },
    },
    nome_exibicao: { type: D.STRING(150), allowNull: true },
    lore: { type: D.TEXT, allowNull: true },
    // Mesma calibração dpr/ehp do Templo (templeBossScalingService é
    // puro/genérico, reaproveitado via require direto — nunca duplicado
    // nem um GameSetting global, já que só existe UM Config aqui).
    target_turns_to_kill: { type: D.INTEGER, allowNull: false, defaultValue: 8 },
    target_boss_actions_survivable: { type: D.INTEGER, allowNull: false, defaultValue: 6 },
    scaling_min_multiplier: { type: D.FLOAT, allowNull: false, defaultValue: 0.5 },
    scaling_max_multiplier: { type: D.FLOAT, allowNull: false, defaultValue: 3 },
    // Recompensa fixa do primeiro clear (nunca um catálogo sorteável
    // nesta fase — ver nota de topo).
    reward_ouro_primeira_vitoria: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    reward_xp_primeira_vitoria: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: D.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "event_puzzle_boss_configs", ...timestamps },
);

const EventPuzzleBossPhase = sequelize.define(
  "EventPuzzleBossPhase",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_boss_config: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_puzzle_boss_configs", key: "id" },
    },
    ordem: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    hp_threshold_pct: { type: D.INTEGER, allowNull: false },
    nome_exibicao: { type: D.STRING(150), allowNull: true },
    dano_multiplicador: { type: D.FLOAT, allowNull: false, defaultValue: 1 },
    defesa_multiplicador: { type: D.FLOAT, allowNull: false, defaultValue: 1 },
    enrage: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: "event_puzzle_boss_phases", ...timestamps },
);

const EventPuzzleBossStatusResistance = sequelize.define(
  "EventPuzzleBossStatusResistance",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_boss_config: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_puzzle_boss_configs", key: "id" },
    },
    status_key: { type: D.STRING(40), allowNull: false },
    imune: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
    resistencia_pct: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "event_puzzle_boss_status_resistances", ...timestamps },
);

const EventPuzzleBossAttempt = sequelize.define(
  "EventPuzzleBossAttempt",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event_edition: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_editions", key: "id" },
    },
    character_id: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    status: {
      type: D.ENUM("Ativa", "Vitoria", "Derrota", "Abandonada"),
      allowNull: false,
      defaultValue: "Ativa",
    },
    // Snapshots congelados na criação — nunca recalculados durante a
    // tentativa (anti-exploit, mesmo princípio do Templo).
    player_snapshot: { type: D.JSONB, allowNull: false },
    boss_snapshot: { type: D.JSONB, allowNull: false },
    runtime_state: { type: D.JSONB, allowNull: false, defaultValue: {} },
    started_at: { type: D.DATE, allowNull: false, defaultValue: D.NOW },
    finished_at: { type: D.DATE, allowNull: true },
    cleared_at: { type: D.DATE, allowNull: true },
    reward_granted_at: { type: D.DATE, allowNull: true },
  },
  { tableName: "event_puzzle_boss_attempts", ...timestamps },
);

const EventPuzzleBossRewardGrant = sequelize.define(
  "EventPuzzleBossRewardGrant",
  {
    id: { type: D.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event_edition: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_editions", key: "id" },
    },
    character_id: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    id_attempt: {
      type: D.INTEGER,
      allowNull: false,
      references: { model: "event_puzzle_boss_attempts", key: "id" },
    },
    ouro_concedido: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
    xp_concedido: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "event_puzzle_boss_reward_grants", ...timestamps },
);

module.exports = {
  EventPuzzleBossConfig,
  EventPuzzleBossPhase,
  EventPuzzleBossStatusResistance,
  EventPuzzleBossAttempt,
  EventPuzzleBossRewardGrant,
};
