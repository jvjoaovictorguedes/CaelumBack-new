const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — auditoria imutável do grant real da
// primeira vitória contra o Guardião (§8.1/§14.1/§14.2). UNIQUE
// (id_event, character_id): nunca paga duas vezes.
const TempleBossRewardGrant = sequelize.define(
  "TempleBossRewardGrant",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    id_attempt: { type: DataTypes.INTEGER, allowNull: false },
    sigilos_concedidos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM("Pending", "Granted", "Failed"), allowNull: false, defaultValue: "Pending" },
    detalhes: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { tableName: "temple_boss_reward_grants" },
);

module.exports = TempleBossRewardGrant;
