const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Definição do chefe de guilda por ranque (F...S+) — pool de vida gigante
// de propósito: uma pessoa só não derruba sozinha, precisa da guilda
// inteira batendo dentro da janela de tempo (ver GuildGateAttempt).
const GuildRankGate = sequelize.define(
  "GuildRankGate",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    rank: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
    },
    nome_chefe: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    vida_total: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    defesa: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    janela_horas: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    recompensa_tesouro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    recompensa_dinheiro_por_membro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    imagem_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "guild_rank_gates",
  },
);

module.exports = GuildRankGate;
