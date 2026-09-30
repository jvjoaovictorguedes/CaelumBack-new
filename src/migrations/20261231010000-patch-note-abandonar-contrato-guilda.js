"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Guilda dos Aventureiros' AND titulo = 'Abandonar contrato de Rank' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Abandonar contrato de Rank já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Guilda dos Aventureiros', '1.4', 'Abandonar contrato de Rank',
         'Agora dá pra abandonar um contrato de Rank aceito na Guilda dos Aventureiros a qualquer momento, liberando a vaga na hora em vez de esperar as 6h de expiração. Você perde o progresso do contrato abandonado.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Guilda dos Aventureiros", titulo: "Abandonar contrato de Rank" });
  },
};
