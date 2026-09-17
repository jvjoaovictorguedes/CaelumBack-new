const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GuildLog = sequelize.define(
  "GuildLog",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    id_personagem_responsavel: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    id_personagem_alvo: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    detalhes: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
  },
  {
    tableName: "GuildLogs",
    updatedAt: false,
  },
);

module.exports = GuildLog;
