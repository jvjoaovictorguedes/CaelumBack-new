"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Mercado' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Mercado 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Mercado', '2.1', 'Mercado agora é Mercado Negro',
         'O Mercado entre jogadores mudou de nome pra Mercado Negro. Cada anúncio agora mostra o ícone do item à venda, além de um novo filtro de busca por raridade.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Mercado", versao: "2.1" });
  },
};
