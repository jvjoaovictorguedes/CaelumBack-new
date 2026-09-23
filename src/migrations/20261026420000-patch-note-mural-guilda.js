"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aprimoramento de Guildas' AND versao = '2.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aprimoramento de Guildas 2.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aprimoramento de Guildas', '2.4', 'Mural da Guilda',
         'Nova aba na guilda: o Mural. O líder e o cargo logo abaixo dele podem fixar avisos e removê-los quando quiserem; o resto dos membros só acompanha.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aprimoramento de Guildas", versao: "2.4" });
  },
};
