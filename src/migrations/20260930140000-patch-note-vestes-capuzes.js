"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Equipamentos' AND versao = '1.3' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Equipamentos 1.3 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Equipamentos', '1.3', '10 capacetes e armaduras novos com foco em Inteligência',
         'Capuz e Vestes de Aprendiz, Arcano(a), do Adepto, das Sombras e Celestial — 5 raridades cada, com bônus voltado pra Inteligência/Velocidade. Já aparecem na Loja, no drop de combate e têm receita própria na Forja.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Equipamentos", versao: "1.3" });
  },
};
