const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico persistido do chat global (mesmo padrão de GuildChatMessage,
// sem id_guild — é uma sala única pro servidor inteiro). nome_personagem
// fica congelado no momento do envio (não um join ao vivo com Character)
// — histórico não deveria mudar retroativamente se o personagem trocar
// de nome depois.
const GlobalChatMessage = sequelize.define(
  "GlobalChatMessage",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
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
    tableName: "GlobalChatMessages",
    updatedAt: false,
  },
);

module.exports = GlobalChatMessage;
