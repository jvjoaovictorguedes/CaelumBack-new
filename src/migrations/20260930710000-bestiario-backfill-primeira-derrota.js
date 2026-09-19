"use strict";

// Backfill pra quem já tinha linha em character_monster_kills ANTES da
// coluna primeira_derrota_em existir (ex.: os abates de Class Evolution
// gerados nesta mesma sessão) — sem isso, o Bestiário mostrava um
// monstro já derrotado dezenas de vezes como "???" só porque a data da
// primeira derrota nunca foi registrada (a coluna não existia ainda).
// updatedAt é a melhor aproximação disponível pra "quando descobriu"
// nesses casos antigos (não é exatamente a data da primeira vitória,
// mas evita a inconsistência de "abates > 0 e ainda ???").
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE character_monster_kills
       SET primeira_derrota_em = "updatedAt"
       WHERE quantidade > 0 AND primeira_derrota_em IS NULL;`,
    );
  },

  async down() {
    // Não reverte de propósito — não dá pra distinguir depois quais
    // linhas foram preenchidas por este backfill vs por uma vitória de
    // verdade que aconteceu logo em seguida.
  },
};
