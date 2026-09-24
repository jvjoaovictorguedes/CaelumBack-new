"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'PvP' AND versao = '2.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota PvP 2.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'PvP', '2.4', 'Duelo no limite de tempo agora é decidido pelo dano',
         'Quando um duelo bate o limite de turnos sem ninguém vencer, quem causou mais dano de verdade agora é quem leva a vitória — antes um jogador que passou o duelo inteiro só se curando podia vencer só por estar com mais vida no fim, mesmo sem chegar perto de derrotar o oponente.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "PvP", versao: "2.4" });
  },
};
