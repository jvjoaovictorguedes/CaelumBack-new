"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.12' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.12 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.12', 'Corrigido: fundo de batalha em branco contra alguns monstros',
         'A batalha contra o Draconídeo Jovem (Covil do Minotauro) estava caindo num fundo genérico em branco em vez de um cenário temático. Corrigido.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.12" });
  },
};
