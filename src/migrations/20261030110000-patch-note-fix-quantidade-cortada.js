"use strict";

// Mudança 100% de frontend (MaterialsGrid/ConsumablesGrid/AbilitiesPanel,
// caelumfront-new) — esta migration só registra a nota de patch.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Itens' AND versao = '1.1' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Itens 1.1 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Itens', '1.1', 'Corrigido: quantidade dos itens ficava cortada no quadrado',
         'O número de quantidade em materiais, consumíveis e habilidades estava sendo cortado pela borda do quadrado do item. Agora ele aparece inteiro, por cima da imagem.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Itens", versao: "1.1" });
  },
};
