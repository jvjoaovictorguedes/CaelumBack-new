"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Expedição' AND versao = '1.5' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Expedição 1.5 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Expedição', '1.5', 'Ícones novos pros recursos de Exploração',
         'Os 10 recursos de Exploração (Erva Medicinal, Erva de Mana, Flor Solar, Cogumelo Carmesim, Erva Lunar, Flor Lunar, Raiz Ancestral, Fruto Místico, Essência Celestial e Essência Elemental) ganharam ícone próprio — eram os únicos recursos da Expedição que ainda estavam sem, desde a Mineração e a Silvicultura já terem recebido os deles.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.5" });
  },
};
