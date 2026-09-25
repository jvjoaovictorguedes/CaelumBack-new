const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GuildJournalEntry = sequelize.define(
  "GuildJournalEntry",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false },
    categoria: {
      type: DataTypes.ENUM("ConquistaIndividual", "ConquistaDeGuilda", "Evento", "Outro"),
      allowNull: false,
      defaultValue: "Outro",
    },
    titulo: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    resumo: { type: DataTypes.STRING(280), allowNull: true },
    imagem_url: { type: DataTypes.STRING(500), allowNull: true },
    personagem_nome: { type: DataTypes.STRING(100), allowNull: true },
    guilda_nome: { type: DataTypes.STRING(100), allowNull: true },
    destaque: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: {
      type: DataTypes.ENUM("Rascunho", "Publicado", "Agendado"),
      allowNull: false,
      defaultValue: "Publicado",
    },
    created_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
    publicado_em: { type: DataTypes.DATEONLY, allowNull: false },
  },
  { tableName: "guild_journal_entries" },
);

module.exports = GuildJournalEntry;
