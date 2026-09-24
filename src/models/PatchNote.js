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
    resumo: { type: DataTypes.STRING(280), allowNull: true },
    imagem_url: { type: DataTypes.STRING(500), allowNull: true },
    destaque: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: {
      type: DataTypes.ENUM("Rascunho", "Publicado", "Agendado"),
      allowNull: false,
      defaultValue: "Publicado",
    },
    created_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
    publicado_em: { type: DataTypes.DATEONLY, allowNull: false },
  },
  { tableName: "patch_notes" },
);

module.exports = PatchNote;
