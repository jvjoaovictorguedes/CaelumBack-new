"use strict";

// PvP v2 §16-bis — novo formato de chave "16x16" (Oitavas de Final como
// primeira rodada) e início de torneio com contagem insuficiente (quem
// fica sem oponente avança por W.O., ver tournamentBracketService.js e
// tournamentService.iniciar). Único ajuste de schema necessário: o ENUM
// de round precisa aceitar "Oitavas".
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_tournament_series_round" ADD VALUE IF NOT EXISTS 'Oitavas';
    `);
  },

  async down() {
    // Postgres não suporta remover valor de ENUM sem recriar o tipo —
    // não vale o risco de recriar "enum_tournament_series_round" só pra
    // reverter uma migration aditiva (mesmo padrão já usado em
    // 20260930670000-item-tipo-espolio.js).
  },
};
