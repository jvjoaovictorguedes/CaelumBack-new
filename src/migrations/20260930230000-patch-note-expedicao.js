"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Expedição' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Expedição 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Expedição', '1.0', 'Nova funcionalidade: Expedição',
         'Chegou a Expedição! Três profissões pra evoluir (Mineração, Silvicultura e Exploração), cada uma com nível 1 a 10, 5 regiões próprias que vão desbloqueando conforme você sobe de nível, e materiais de até 6 qualidades diferentes pra coletar. Cada coleta tem um pequeno tempo de espera antes da próxima.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.0" });
  },
};
