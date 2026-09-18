"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Expedição' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Expedição 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Expedição', '1.3', 'Cooldown de coleta reduzido pra teste',
         'O tempo mínimo entre duas coletas da mesma profissão caiu de 6 pra 3 segundos, só pra agilizar os testes do beta — cada profissão (Mineração, Silvicultura, Exploração) continua com seu próprio cooldown independente, então coletar numa não trava as outras duas.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.3" });
  },
};
