"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.6' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.6 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.6', 'Aventura em grupo ganhou vida',
         'A luta em grupo agora anima de verdade: cada aventureiro avança pra golpear o inimigo e volta pro grupo, e o cenário de fundo passou a mostrar o monstro ou a zona enfrentada, igual na aventura solo. A barra de poderes e itens também ficou menor e mais transparente, tanto na Aventura quanto na luta com os amigos, pra não tampar mais o personagem durante o combate.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.6" });
  },
};
