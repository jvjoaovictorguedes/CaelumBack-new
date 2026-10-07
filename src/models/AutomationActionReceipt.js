const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
module.exports = sequelize.define(
  "AutomationActionReceipt",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true },
    action_id: { type: DataTypes.UUID, primaryKey: true },
    session_id: DataTypes.INTEGER,
    state_version: DataTypes.INTEGER,
    result: DataTypes.JSONB,
  },
  { tableName: "automation_action_receipts" },
);
