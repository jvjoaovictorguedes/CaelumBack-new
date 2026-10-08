const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
module.exports = sequelize.define(
  "AutomationEvent",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    id_personagem: DataTypes.INTEGER,
    event_type: DataTypes.STRING(40),
    action_type: DataTypes.STRING(80),
    risk_delta: DataTypes.FLOAT,
    metadata: { type: DataTypes.JSONB, defaultValue: {} },
  },
  { tableName: "automation_events", timestamps: true },
);
