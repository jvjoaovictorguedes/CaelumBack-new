const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ExpeditionRegion = sequelize.define(
  "ExpeditionRegion",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    profissao: { type: DataTypes.ENUM("Mineracao", "Silvicultura", "Exploracao"), allowNull: false },
    nivel_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "expedition_regions" },
);

module.exports = ExpeditionRegion;
