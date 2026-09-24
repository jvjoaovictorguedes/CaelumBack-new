"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Interface",
        versao: "1.0",
        titulo: "Avisos mais legíveis",
        descricao:
          "Mensagens de aviso e erro (como o aviso de cooldown de duelo no PvP) agora aparecem com um fundo escuro atrás do texto, em vez de ficarem soltas em cima da imagem de fundo — bem mais fácil de ler.",
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
    await queryInterface.bulkDelete("patch_notes", { feature: "Interface", versao: "1.0" });
  },
};
