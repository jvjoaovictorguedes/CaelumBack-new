const { DataTypes: D } = require("sequelize");
const { sequelize } = require("../config/database");
const id = () => ({
  type: D.INTEGER,
  primaryKey: true,
  autoIncrement: true,
  allowNull: false,
});
const integer = (nullable = false) => ({
  type: D.INTEGER,
  allowNull: nullable,
});
const json = (value = {}) => ({
  type: D.JSONB,
  allowNull: false,
  defaultValue: value,
});
const text = (nullable = false) => ({ type: D.TEXT, allowNull: nullable });
const fk = (table, nullable = false) => ({
  ...integer(nullable),
  references: { model: table, key: "id" },
  onDelete: "RESTRICT",
});
const define = (name, tableName, fields) =>
  sequelize.define(name, fields, { tableName });
const Config = define("WorldCrisisConfig", "world_crisis_configs", {
  id: id(),
  key: { type: D.STRING(80), unique: true, allowNull: false },
  nome: text(),
  descricao: text(true),
  ativo: { type: D.BOOLEAN, defaultValue: false, allowNull: false },
  structure: json(),
});
const Event = define("WorldCrisisEvent", "world_crisis_events", {
  id: id(),
  crisis_config_id: fk("world_crisis_configs", true),
  source_id: fk("world_boss_events"),
  status: { type: D.STRING(20), allowNull: false },
  current_stage_key: text(),
  config_snapshot: json(),
  started_at: { type: D.DATE, allowNull: false },
  completed_at: { type: D.DATE },
  rankings_frozen_at: { type: D.DATE },
  contributions_paused: {
    type: D.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  runtime_state: json(),
  final_rankings: json(),
  rewards_done: { type: D.BOOLEAN, allowNull: false, defaultValue: false },
});
const Progress = define(
  "WorldCrisisRequirementProgress",
  "world_crisis_progress",
  {
    id: id(),
    event_id: fk("world_crisis_events"),
    stage_key: text(),
    requirement_key: text(),
    current_progress: { type: D.BIGINT, allowNull: false, defaultValue: 0 },
    target_progress: { type: D.BIGINT, allowNull: false },
    completed_at: { type: D.DATE },
  },
);
const Contribution = define(
  "WorldCrisisContribution",
  "world_crisis_contributions",
  {
    id: id(),
    event_id: fk("world_crisis_events"),
    stage_key: text(),
    requirement_key: text(),
    character_id: fk("Characters"),
    guild_id_at_contribution: integer(true),
    ranking_guild_id: integer(true),
    item_id: fk("Items"),
    quantity: integer(),
    progress_units: { type: D.BIGINT, allowNull: false },
    ranking_points: { type: D.BIGINT, allowNull: false },
    request_id: { type: D.STRING(100), allowNull: false },
    response: json(),
  },
);
const Participation = define(
  "WorldCrisisCharacterParticipation",
  "world_crisis_participation",
  {
    id: id(),
    event_id: fk("world_crisis_events"),
    character_id: fk("Characters"),
    ranking_guild_id: integer(true),
  },
);
const GuildSnapshot = define(
  "WorldCrisisGuildSnapshot",
  "world_crisis_guild_snapshots",
  {
    id: id(),
    event_id: fk("world_crisis_events"),
    guild_id: integer(),
    guild_name_snapshot: text(),
    member_count_snapshot: integer(),
    existed_at_start: { type: D.BOOLEAN, allowNull: false },
  },
);
const Announcement = define(
  "WorldCrisisAnnouncement",
  "world_crisis_announcements",
  {
    id: id(),
    event_id: fk("world_crisis_events"),
    seq: integer(),
    type: text(),
    title: text(),
    message: text(),
    payload: json(),
  },
);
const UiState = define("CharacterWorldCrisisUiState", "world_crisis_ui_state", {
  id: id(),
  event_id: fk("world_crisis_events"),
  character_id: fk("Characters"),
  last_seen_announcement_seq: { ...integer(), defaultValue: 0 },
});
const Grant = define("WorldCrisisRewardGrant", "world_crisis_reward_grants", {
  id: id(),
  event_id: fk("world_crisis_events"),
  recipient_type: text(),
  recipient_id: integer(),
  tier_key: text(),
  status: { type: D.STRING(20), allowNull: false, defaultValue: "Pending" },
  payload_snapshot: json([]),
  granted_at: { type: D.DATE },
});
module.exports = {
  Config,
  Event,
  Progress,
  Contribution,
  Participation,
  GuildSnapshot,
  Announcement,
  UiState,
  Grant,
};
