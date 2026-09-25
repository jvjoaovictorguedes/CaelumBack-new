const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Zonas de Aventura elegíveis pra descoberta de um WorldBossConfig
// (§4/§5 — descoberta só ocorre em vitórias PvE dentro dessas zonas).
const WorldBossConfigZone = sequelize.define(
  "WorldBossConfigZone",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    id_zone: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "world_boss_config_zones" },
);

module.exports = WorldBossConfigZone;
