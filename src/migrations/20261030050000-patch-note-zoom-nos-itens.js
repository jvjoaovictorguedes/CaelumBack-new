"use strict";

// Mudança 100% de frontend (hover:scale em várias telas de itens,
// caelumfront-new) — esta migration só registra a nota de patch.
module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Itens' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Itens 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Itens', '1.0', 'Ícones de itens dão um zoom ao passar o mouse',
         'Em qualquer tela com itens, equipamentos ou consumíveis (Inventário, Loja, Mercado, Forja, Personagem, Expedição), passar o mouse por cima da imagem agora dá um leve zoom, mantendo a descrição do item.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Itens", versao: "1.0" });
  },
};
