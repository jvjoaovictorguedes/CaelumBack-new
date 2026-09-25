"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Admin Pesca' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Admin Pesca 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Admin Pesca', '1.0', 'Bastidores: painel administrativo de Pesca & Navegação',
         'Novo módulo no Painel Administrativo pra gerenciar o conteúdo de Pesca & Navegação: Zonas, Espécies, o pool de encontro (quais espécies aparecem em cada zona), Portos, Iscas e Afinidades entre isca e espécie. Não muda nada pra quem já pesca — é ferramenta de bastidores.',
         'Ferramenta de bastidores: administração completa de Zonas, Espécies, Portos, Iscas e Afinidades de Pesca.',
         false, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Admin Pesca", versao: "1.0" });
  },
};
