"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'PvP' AND versao = '2.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota PvP 2.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'PvP', '2.1', 'Emblemas de Elo de verdade + novo Tier Grão-Mestre',
         'O emblema de Elo da Arena Ranqueada deixou de ser um círculo colorido genérico e ganhou uma imagem própria por Tier. Além disso, um novo Tier entrou acima de Mestre: Grão-Mestre, pra quem chegar a 3500 de rating ou mais — Mestre agora vai de 3000 a 3499.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "PvP", versao: "2.1" });
  },
};
