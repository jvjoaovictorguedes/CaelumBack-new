"use strict";

// Sistema de Taverna §9 — catálogo inicial dos 4 jogos 50/50. Todos
// usam o MESMO motor (tavernGameService); só a apresentação muda.
// win_chance_ppm = 500000 (exatamente 50%) e payout_multiplier < 2.00
// (§9.1: vantagem da casa pequena e transparente, nunca >= 2.00).
module.exports = {
  async up(queryInterface) {
    const JOGOS = [
      ["coin", "Cara ou Coroa", "A moeda gira no ar e revela a face — Dourada ou Sombria.", "COIN", 1],
      ["runes", "Runas do Destino", "Duas runas antigas repousam na mesa. Uma delas é sorteada.", "RUNES", 2],
      ["dice_parity", "Dados do Goblin", "Dois dados rolam juntos — aposte se a soma será par ou ímpar.", "DICE_PARITY", 3],
      ["card_side", "Carta do Trapaceiro", "Duas cartas fechadas sobre o balcão. Só uma delas vence.", "CARD_SIDE", 4],
    ];

    for (const [key, nome, descricao, presentationKey, ordem] of JOGOS) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM tavern_games WHERE key = :key LIMIT 1;`,
        { replacements: { key } },
      );
      if (existente.length > 0) continue;

      await queryInterface.sequelize.query(
        `INSERT INTO tavern_games
           (key, nome, descricao, presentation_key, win_chance_ppm, payout_multiplier, min_bet, max_bet, ordem, ativo, "createdAt", "updatedAt")
         VALUES (:key, :nome, :descricao, :presentationKey, 500000, 1.90, 10, 1000, :ordem, true, now(), now());`,
        { replacements: { key, nome, descricao, presentationKey, ordem } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM tavern_games WHERE key IN ('coin', 'runes', 'dice_parity', 'card_side');`,
    );
  },
};
