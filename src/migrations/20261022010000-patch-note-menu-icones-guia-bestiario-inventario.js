"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Menu' AND versao = '1.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Menu 1.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Menu', '1.2', 'Guia do Aventureiro, Bestiário e Meu Inventário ganham ícone próprio',
         'Esses três itens do menu lateral usavam um ícone emprestado de outra tela como placeholder. Agora cada um tem sua arte definitiva.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Menu", versao: "1.2" });
  },
};
