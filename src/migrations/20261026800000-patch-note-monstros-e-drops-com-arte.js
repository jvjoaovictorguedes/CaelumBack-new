"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '4.2' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 4.2 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '4.2', 'Retratos dos monstros e mais ilustrações de espólio',
         'Os 31 monstros novos da Expansão Aventura Beta agora têm retrato próprio no Bestiário. Mais 57 espólios dropados por monstros também ganharam ilustração.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "4.2" });
  },
};
