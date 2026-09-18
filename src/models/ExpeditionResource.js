const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ExpeditionResource = sequelize.define(
  "ExpeditionResource",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    profissao: { type: DataTypes.ENUM("Mineracao", "Silvicultura", "Exploracao"), allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "expedition_resources" },
);

module.exports = ExpeditionResource;
