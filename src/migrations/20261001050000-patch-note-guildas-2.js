"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aprimoramento de Guildas' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aprimoramento de Guildas 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aprimoramento de Guildas', '2.0', 'Guildas ganharam Missões, Benefícios e Boss',
         'O Portal de Guilda virou Boss da Guilda: agora é liberado uma vez por semana com Gold do Tesouro, e a recompensa (Gold e XP pros participantes) é dividida por dano causado. Nova aba de Missões da Guilda — a mesma missão diária, semanal, mensal e de Rank pra todo mundo, com progresso individual e sem precisar aceitar nada. O Rank da Guilda (F a S) agora sobe automaticamente completando essas Missões de Rank, não mais derrotando um chefe. Nova aba de Benefícios: o líder pode gastar o Tesouro em Buffs permanentes de XP, Gold e Forja pra guilda inteira. Doação de ouro não gera mais XP — agora só financia o Tesouro. E tem uma nova categoria no Ranking global: Boss da Guilda, pelas guildas que mais derrotaram bosses.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aprimoramento de Guildas", versao: "2.0" });
  },
};
