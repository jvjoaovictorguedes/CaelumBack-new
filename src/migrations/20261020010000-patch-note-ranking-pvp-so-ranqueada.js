"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Ranking' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Ranking 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Ranking', '2.1', 'Ranking de PvP agora é só da Arena Ranqueada',
         'A aba PvP do Ranking geral passou a considerar exclusivamente o rating da Arena Ranqueada da temporada ativa — o Duelo casual não entra mais nessa pontuação. O casual continua existindo pra jogar sem compromisso, sem afetar posição ou troféu nenhum; quem quiser subir no ranking precisa jogar ranqueada.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Ranking", versao: "2.1" });
  },
};
