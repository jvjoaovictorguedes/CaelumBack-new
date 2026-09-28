const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// "Visto por último" do Jornal da Guilda — mesmo padrão de
// UserPatchNoteSeen.js (por CONTA, não por personagem), usado pro badge
// de notificação tanto na aba "Jornal" dentro da Guilda dos Aventureiros
// quanto no próprio Jornal (marcador "Novo" por nota).
const UserGuildJournalSeen = sequelize.define(
  "UserGuildJournalSeen",
  {
    id_usuario: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    ultimo_id_visto: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "user_guild_journal_seen" },
);

module.exports = UserGuildJournalSeen;
