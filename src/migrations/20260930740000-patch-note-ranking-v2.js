"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Ranking' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Ranking 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Ranking', '2.0', 'Ranking reformulado: 5 categorias',
         'O Ranking agora tem 5 abas: Nível, Gold (pelo ouro total já ganho, não pelo saldo), Guilda (por XP), PvP (pontuação combinando desempenho e atividade, com requisito mínimo de combates) e Forja (por XP de profissão). Cada aba mostra sua posição, mesmo fora do topo, e quem está online.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Ranking", versao: "2.0" });
  },
};
