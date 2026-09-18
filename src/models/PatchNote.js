const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const PatchNote = sequelize.define(
  "PatchNote",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false },
    feature: { type: DataTypes.STRING(60), allowNull: false },
    versao: { type: DataTypes.STRING(20), allowNull: false },
    titulo: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    publicado_em: { type: DataTypes.DATEONLY, allowNull: false },
  },
  { tableName: "patch_notes" },
);

module.exports = PatchNote;
