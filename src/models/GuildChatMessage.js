const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico persistido do chat de guilda (item da fila: "CHAT DA GUILDA
// DEVERÁ MANTER HISTÓRICO DE MENSAGENS - APAGA TODO MÊS"). Antes disso o
// chat (guildSocket.js) era só tempo real, sem guardar nada — ver
// guildChatService.js pra saber onde a limpeza mensal acontece (lazy,
// sem cron, mesmo padrão de reset das Missões cíclicas).
// nome_personagem fica congelado no momento do envio (não um join
// ao vivo com Character) — histórico não deveria mudar retroativamente
// se o personagem trocar de nome depois.
const GuildChatMessage = sequelize.define(
  "GuildChatMessage",
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
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    nome_personagem: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    texto: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
  },
  {
    tableName: "GuildChatMessages",
    updatedAt: false,
  },
);

module.exports = GuildChatMessage;
