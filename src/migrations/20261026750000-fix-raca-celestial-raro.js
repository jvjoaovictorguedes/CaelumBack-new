"use strict";

// Corrige dado que já existir com o bug do seed de dev
// (20260916200000-seed-races.js): a raça "Celestial" foi inserida sem
// raro:true (default false), então raceController.getAllRaces
// (filtro correto: WHERE raro = false, "raça rara só entra via
// sorteio, nunca na lista normal") deixava passar Celestial como
// opção comum na tela de criação de personagem — mesmo o model, o
// controller e a própria descrição do seed já tratando Celestial como
// raça rara.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Races" SET raro = true WHERE nome_masculino = 'Celestial' AND raro = false;`,
    );
    console.log(`[migration] Raça(s) "Celestial" corrigida(s) pra raro=true.`);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "Races" SET raro = false WHERE nome_masculino = 'Celestial';`,
    );
  },
};
