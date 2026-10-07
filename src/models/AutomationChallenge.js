const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
module.exports = sequelize.define(
  "AutomationChallenge",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    id_personagem: DataTypes.INTEGER,
    provider: { type: DataTypes.STRING(30), defaultValue: "TURNSTILE" },
    status: { type: DataTypes.STRING(30), defaultValue: "PENDING" },
    expires_at: DataTypes.DATE,
    verified_at: DataTypes.DATE,
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: "automation_challenges", timestamps: true },
);
