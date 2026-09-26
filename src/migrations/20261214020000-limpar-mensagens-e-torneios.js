"use strict";

// Pedido explícito: "Limpe todas as mensagens e torneios existentes no
// jogo" — reset de conteúdo dessas duas features (mesmo padrão já usado
// em 20261130010000-reset-patch-notes-beta-1-0.js). TRUNCATE ... CASCADE
// em "tournaments" já arrasta tournament_participants/tournament_series/
// tournament_matches (todas com ON DELETE CASCADE em tournament_id/
// series_id — ver 20261026020000-torneios-schema.js), sem precisar
// listar cada tabela filha na mão.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('TRUNCATE TABLE "messages" RESTART IDENTITY;', { transaction });
      await queryInterface.sequelize.query('TRUNCATE TABLE "tournaments" RESTART IDENTITY CASCADE;', { transaction });
    });
  },

  // Down proposital sem-op — é uma limpeza de dados, não uma mudança de
  // schema; não existe "desfazer" um TRUNCATE.
  async down() {
    console.log("[migration] down() é no-op — limpeza de dados não tem volta.");
  },
};
