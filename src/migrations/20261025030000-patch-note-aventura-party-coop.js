"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.5' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.5 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.5', 'Chame seus amigos para a Aventura',
         'Nova seção "Chamar amigos" na Aventura: convide até 3 jogadores online, monte um grupo com lobby de "pronto" (só o dono do grupo inicia) e enfrentem juntos um monstro escalado pro tamanho do grupo, em tela cheia mostrando vida e mana de todos os aliados.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.5" });
  },
};
