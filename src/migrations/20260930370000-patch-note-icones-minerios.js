"use strict";

module.exports = {
  async up(queryInterface) {
    const notas = [
      {
        feature: "Expedição",
        versao: "1.1",
        titulo: "Ícones novos pros fragmentos de minério",
        descricao:
          "Os 8 minérios de Mineração (Ferro, Cobre, Prata, Ouro, Cristal de Mana, Obsidiana, Astralita e Minério Celestial) ganharam ícone próprio de fragmento, em vez do quadradinho genérico.",
      },
      {
        feature: "Forja",
        versao: "3.1",
        titulo: "Ícones novos pras barras de minério",
        descricao:
          "As barras fundidas na aba Fundição agora têm ícone próprio pra cada um dos 8 minérios, em vez do quadradinho genérico.",
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
    await queryInterface.bulkDelete("patch_notes", { feature: "Expedição", versao: "1.1" });
    await queryInterface.bulkDelete("patch_notes", { feature: "Forja", versao: "3.1" });
  },
};
