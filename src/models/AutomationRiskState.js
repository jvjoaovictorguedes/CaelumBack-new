const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
module.exports = sequelize.define(
  "AutomationRiskState",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true },
    score: { type: DataTypes.FLOAT, defaultValue: 0 },
    status: { type: DataTypes.STRING(40), defaultValue: "NORMAL" },
    signal_families: { type: DataTypes.JSONB, defaultValue: [] },
    last_signal_at: DataTypes.DATE,
    last_decay_at: DataTypes.DATE,
    verified_until: DataTypes.DATE,
    restricted_until: DataTypes.DATE,
    exempt_until: DataTypes.DATE,
    version: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: "automation_risk_states", timestamps: true },
);
