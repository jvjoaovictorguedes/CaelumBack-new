"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Mercado' AND versao = '2.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Mercado 2.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Mercado', '2.2', 'Correções no Mercado Negro',
         'Corrigido: ao anunciar um item pra venda, clicar em um deles podia destacar quase todos os outros ao mesmo tempo. Corrigido também um problema raro em que comprar certos equipamentos antigos não entregava o item ao comprador — esses anúncios corrompidos foram cancelados automaticamente.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Mercado", versao: "2.2" });
  },
};
