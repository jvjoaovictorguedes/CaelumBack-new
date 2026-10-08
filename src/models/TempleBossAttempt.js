const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — uma tentativa individual contra o Guardião
// (§8.1/§9.3/§11.1). player_snapshot/boss_snapshot congelam build e
// stats escalados no INÍCIO da tentativa — nunca recalculados durante
// ela (anti-exploit).
const TempleBossAttempt = sequelize.define(
  "TempleBossAttempt",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("Ativa", "Vitoria", "Derrota", "Abandonada"),
      allowNull: false,
      defaultValue: "Ativa",
    },
    player_snapshot: { type: DataTypes.JSONB, allowNull: false },
    boss_snapshot: { type: DataTypes.JSONB, allowNull: false },
    runtime_state: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    cleared_at: { type: DataTypes.DATE, allowNull: true },
    reward_granted_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "temple_boss_attempts" },
);

module.exports = TempleBossAttempt;
