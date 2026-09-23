"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Aventura' AND versao = '4.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Aventura 4.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Aventura', '4.0', 'Grande expansão da Aventura: 10 Áreas de Caça, 40 monstros',
         'A Aventura cresceu de 3 pra 10 Áreas de Caça, cobrindo toda a progressão do nível 1 ao 50 — 4 monstros por área (3 Comuns + 1 Raro), 40 no total, cada um com seus próprios espólios. O saque agora é individual por monstro (não mais compartilhado entre todos da mesma área) e cada item tem sua própria chance de cair, então uma vitória pode render mais de um espólio de uma vez. A Guilda dos Aventureiros ganhou contratos novos pras áreas recém-chegadas, e quem já tinha Maestria conquistada numa área não perde o progresso só porque o catálogo dela cresceu.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Aventura", versao: "4.0" });
  },
};
