"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Bestiário' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Bestiário 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Bestiário', '1.0', 'Bestiário e Maestria Regional',
         'Novo menu Bestiário: cada região da Aventura agora tem uma ficha por monstro, revelada só depois da primeira vitória contra ele. Ao derrotar todos os monstros de uma região, você libera a Maestria I; continue caçando lá pra subir até a Maestria V e ganhar bônus pequenos de XP, ouro e espólios — só naquela região.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Bestiário", versao: "1.0" });
  },
};
