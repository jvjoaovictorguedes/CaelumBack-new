"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Pesca & Navegação' AND versao = '1.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Pesca & Navegação 1.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Pesca & Navegação', '1.1', 'Pesca agora exige vara no inventário',
         'Não é mais possível pescar de mãos livres — escolha uma vara de pesca (item Ferramenta) no seu inventário antes de lançar a linha. O ícone de Pesca no menu lateral também ganhou arte própria.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Pesca & Navegação", versao: "1.1" });
  },
};
