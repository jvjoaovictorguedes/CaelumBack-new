const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Guild = sequelize.define(
  "Guild",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(24),
      allowNull: false,
      unique: true,
    },
    sigla: {
      type: DataTypes.STRING(5),
      allowNull: false,
      unique: true,
    },
    descricao: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    emblema_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    id_fundador: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    id_lider: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    nivel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    experiencia: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    prestigio: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tesouro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    limite_membros: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25,
    },
    tipo_recrutamento: {
      type: DataTypes.ENUM("Aberto", "Aprovacao", "Convite"),
      allowNull: false,
      defaultValue: "Aprovacao",
    },
    status: {
      type: DataTypes.ENUM("Ativa", "Dissolucao", "Suspensa", "Encerrada"),
      allowNull: false,
      defaultValue: "Ativa",
    },
    mural: {
      type: DataTypes.STRING(1000),
      allowNull: true,
    },
    meta_ativa: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "Guilds",
  },
);

module.exports = Guild;
