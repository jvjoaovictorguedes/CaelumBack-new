"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Meu Personagem' AND versao = '2.6' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Meu Personagem 2.6 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Meu Personagem', '2.6', 'Mais pontos de atributo por nível',
         'Cada nível conquistado agora concede 4 pontos de atributo para distribuir, em vez de 1.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Meu Personagem", versao: "2.6" });
  },
};
