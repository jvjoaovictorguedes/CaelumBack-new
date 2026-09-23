const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Achievement = require("./Achievement");

// Título — cosmético, aparece abaixo do nome no Perfil (Especificação
// Perfil de Jogador, §25). Nunca concede bônus mecânico.
const Title = sequelize.define(
  "Title",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    id_achievement_desbloqueia: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Achievement, key: "id" },
    },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "titles" },
);

module.exports = Title;
