"use strict";

// Faixas de nível da guilda exatamente como sugerido no documento de
// design (seção 6): vagas por faixa 25/40/55/80 pros níveis 1-4/5-9/
// 10-14/15-20. XP por nível é uma fórmula simples (nivel * 500) — dá pra
// ajustar linha a linha aqui sem tocar em código.
function limitePorNivel(nivel) {
  if (nivel <= 4) return 25;
  if (nivel <= 9) return 40;
  if (nivel <= 14) return 55;
  return 80;
}

const NIVEL_MAXIMO = 20;

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "GuildLevelConfig";',
    );
    if (rows[0].count > 0) {
      console.log('[seed] "GuildLevelConfig" já tem dados — pulando.');
      return;
    }

    const linhas = [];
    for (let nivel = 1; nivel <= NIVEL_MAXIMO; nivel += 1) {
      linhas.push({
        nivel,
        xp_para_proximo_nivel: nivel < NIVEL_MAXIMO ? nivel * 500 : null,
        limite_membros: limitePorNivel(nivel),
      });
    }

    await queryInterface.bulkInsert("GuildLevelConfig", linhas);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("GuildLevelConfig", null);
  },
};
