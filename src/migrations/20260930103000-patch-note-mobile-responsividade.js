"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Mobile",
        versao: "1.1",
        titulo: "Status e descrição dos equipamentos no toque",
        descricao:
          "Agora dá pra ver o dano/defesa/bônus de qualquer item (boneco de papel, inventário, Forja, conjuntos) só tocando nele — antes isso dependia do mouse e nunca aparecia no celular. Corrigidas várias telas que ficavam cortadas ou difíceis de usar no celular: abas da Forja, cards de oponentes no Duelo e do Balcão de Espólios da Guilda, e o aviso de novidades que às vezes tampava o botão do menu.",
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
    await queryInterface.bulkDelete("patch_notes", { feature: "Mobile", versao: "1.1" });
  },
};
