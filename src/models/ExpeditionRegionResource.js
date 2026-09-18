const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ExpeditionRegionResource = sequelize.define(
  "ExpeditionRegionResource",
  {
    id_regiao: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    id_recurso: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    peso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  { tableName: "expedition_region_resources" },
);

module.exports = ExpeditionRegionResource;
