"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Forja",
        versao: "4.0",
        titulo: "Novo: Caldeirão de Alquimia",
        descricao:
          "Chegou o Caldeirão! Uma nova aba dentro da Forja onde você usa espólios da Aventura e recursos da Expedição pra preparar poções, antídotos e outros consumíveis. A Alquimia tem seu próprio nível e XP, separados da Forja — quanto mais você prepara, mais receitas se desbloqueiam. Primeiras receitas disponíveis: Poção de Vida Básica, Poção de Mana Básica e Antídoto (remove Veneno em combate).",
      },
    ];

    for (const nota of notas) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM patch_notes WHERE feature = :feature AND versao = :versao LIMIT 1;`,
        { replacements: { feature: nota.feature, versao: nota.versao } },
      );
      if (existente.length > 0) {
        console.log(`[migration] Nota ${nota.feature} ${nota.versao} já existe — pulando.`);
        continue;
      }

      const [[{ max }]] = await queryInterface.sequelize.query(
        `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
      );

      await queryInterface.sequelize.query(
        `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
         VALUES (:ordem, :feature, :versao, :titulo, :descricao, CURRENT_DATE, now(), now());`,
        { replacements: { ordem: max + 1, ...nota } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "4.0" });
  },
};
