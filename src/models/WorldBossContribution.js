const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Dano total causado por personagem em um evento (§16 — ranking e
// critério de recompensa de participação). Unique (event_id,
// character_id) — uma linha por personagem por evento, incrementada.
const WorldBossContribution = sequelize.define(
  "WorldBossContribution",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    event_id: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    damage_total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    attacks_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    attempts_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_action_seq: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    first_joined_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_action_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "world_boss_contributions", createdAt: false, updatedAt: false },
);

module.exports = WorldBossContribution;
