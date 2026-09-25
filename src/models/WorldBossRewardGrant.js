const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Concessão de recompensa idempotente (§16) — unique (event_id,
// character_id, reward_kind) garante que retry/reprocessamento nunca
// duplica um grant já concedido.
const WorldBossRewardGrant = sequelize.define(
  "WorldBossRewardGrant",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    event_id: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    reward_kind: {
      type: DataTypes.ENUM("DISCOVERY", "PARTICIPATION", "FINAL_BLOW", "OPTIONAL_TOP"),
      allowNull: false,
    },
    payload_snapshot: { type: DataTypes.JSONB, allowNull: true },
    status: { type: DataTypes.ENUM("Pending", "Granted", "Failed"), allowNull: false, defaultValue: "Pending" },
    granted_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "world_boss_reward_grants" },
);

module.exports = WorldBossRewardGrant;
