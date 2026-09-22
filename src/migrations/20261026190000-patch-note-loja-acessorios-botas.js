"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Loja' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Loja 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Loja', '1.2', 'Novas seções: Acessórios e Botas',
         'Anéis e colares, que antes não apareciam na Loja, agora têm aba própria — Acessórios. Botas também ganharam seção separada, deixando de aparecer misturadas com as demais armaduras. Os filtros de tipo de Equipamento perderam os ícones e ficaram só com o nome.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Loja", versao: "1.2" });
  },
};
