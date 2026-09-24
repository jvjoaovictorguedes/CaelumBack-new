"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Guilda dos Aventureiros",
        versao: "1.5",
        titulo: "Explicações nas abas da Guilda",
        descricao:
          "As abas Missões de Rank, Balcão de Espólios e Caçadas agora explicam o que cada uma faz e no que influencia, direto na tela.",
      },
      {
        feature: "Bestiário",
        versao: "1.2",
        titulo: "Drops e bônus de Maestria visíveis",
        descricao:
          "A ficha de cada monstro descoberto agora mostra os itens que ele pode dropar (com chance e quantidade), e a página da região mostra a tabela completa de bônus de XP/Ouro/Espólio de cada nível de Maestria (I a V).",
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
    await queryInterface.bulkDelete("patch_notes", { feature: "Guilda dos Aventureiros", versao: "1.5" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Bestiário", versao: "1.2" });
  },
};
