"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Combate' AND versao = '1.7' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Combate 1.7 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Combate', '1.7', 'Correção: cura de poção/poder sumindo na tela',
         'Usar uma poção ou poder de cura em combate sempre aplicava a cura de verdade, mas a tela só mostrava o saldo do turno inteiro (cura menos o contra-ataque do inimigo em seguida) — se o inimigo batesse mais forte que a cura, ela parecia não ter feito nada, e a animação ainda chegava a sugerir imunidade que nunca existiu de verdade. Agora a cura aparece na hora que acontece, e o contra-ataque do inimigo é sempre mostrado como realmente é.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Combate", versao: "1.7" });
  },
};
