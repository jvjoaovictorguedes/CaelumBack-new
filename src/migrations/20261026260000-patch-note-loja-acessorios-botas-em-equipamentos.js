"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Loja' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Loja 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Loja', '1.3', 'Acessórios e Botas voltam pra Equipamentos',
         'As abas separadas de Acessórios e Botas viraram filtros dentro da aba Equipamentos, junto de Armas, Escudos, Elmos e Armaduras — continuam fáceis de achar, sem fragmentar a Loja em abas demais.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Loja", versao: "1.3" });
  },
};
