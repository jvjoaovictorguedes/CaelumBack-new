const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Mural da guilda (item da fila: quadro de avisos — só líder e o cargo
// logo abaixo dele podem postar/remover, o resto só lê). Não confundir
// com Guild.mural (models/Guild.js): aquele é um texto único editável
// (banner de identidade, permissão "editar_identidade"); este aqui é um
// feed de mensagens individuais com autor e data própria, cada uma
// removível na hora.
// nome_personagem_autor fica congelado no momento do post, mesmo
// motivo do chat de guilda (GuildChatMessage): histórico não deveria
// mudar retroativamente se o personagem trocar de nome depois.
const GuildMuralMessage = sequelize.define(
  "GuildMuralMessage",
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
    id_personagem_autor: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    nome_personagem_autor: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    texto: {
      type: DataTypes.STRING(1000),
      allowNull: false,
    },
  },
  {
    tableName: "GuildMuralMessages",
    updatedAt: false,
  },
);

module.exports = GuildMuralMessage;
