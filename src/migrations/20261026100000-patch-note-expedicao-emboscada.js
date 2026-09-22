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
       VALUES (:ordem, 'Expedição', '1.0', 'Cuidado com emboscadas na Expedição',
         'Agora toda coleta na Expedição — Mineração, Silvicultura ou Exploração, em qualquer região — tem uma pequena chance de ser interrompida por um monstro em vez de render o recurso normal. O nível do inimigo é calibrado pela dificuldade da região: quanto mais avançada, mais forte a emboscada.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.0" });
  },
};
