"use strict";

// Jornal da Guilda — Notificação. Pedido do jogador: sempre que uma
// nota nova for publicada, precisa ficar uma notificação tanto na aba
// "Jornal" dentro da Guilda dos Aventureiros quanto no próprio Jornal.
// Mesmo padrão de user_patch_notes_seen (ver 20260930090000-create-patch-notes.js):
// guarda só o MAIOR id de guild_journal_entries que a conta já viu — o
// front deriva "quantidade não lida" e "é nota nova" comparando id >
// ultimo_id_visto, sem depender de relógio de cliente/servidor bater.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("user_guild_journal_seen")) return;

    await queryInterface.createTable("user_guild_journal_seen", {
      id_usuario: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      ultimo_id_visto: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "guild_journal_entries", key: "id" },
        onDelete: "SET NULL",
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("user_guild_journal_seen");
  },
};
