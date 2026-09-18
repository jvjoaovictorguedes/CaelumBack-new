"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Equipamentos' AND versao = '1.4' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Equipamentos 1.4 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Equipamentos', '1.4', 'Botas arcanas completam o conjunto de Mago',
         'Botas de Aprendiz, Arcanas, do Adepto, das Sombras e Celestiais — mesmo foco em Inteligência/Velocidade do Capuz e das Vestes. Comum já está na Loja, o resto sai só de drop ou forjando.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Equipamentos", versao: "1.4" });
  },
};
