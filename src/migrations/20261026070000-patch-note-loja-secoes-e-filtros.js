"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Loja' AND versao = '1.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Loja 1.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Loja', '1.1', 'Loja reorganizada em seções, com filtros de equipamento',
         'A Loja ganhou abas: Equipamentos, Consumíveis e Materiais. Dentro de Equipamentos, filtros marcáveis por tipo (Armas, Escudos, Elmos, Armaduras) deixam a vitrine só com o que você quer ver — desmarque um tipo e os itens dele somem na hora.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Loja", versao: "1.1" });
  },
};
