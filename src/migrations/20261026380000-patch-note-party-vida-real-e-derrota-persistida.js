"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '3.13' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 3.13 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '3.13', 'Corrigido: vida do grupo curando sozinha e derrota na party não contando',
         'Entrar numa aventura em grupo curava a vida de todo mundo de graça, mesmo de quem já tinha entrado machucado — agora o grupo entra em combate com a vida real de cada aventureiro. Além disso, morrer numa batalha de grupo agora conta de verdade: o personagem sai da party precisando se recuperar antes da próxima aventura, igual já acontecia numa aventura solo.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "3.13" });
  },
};
