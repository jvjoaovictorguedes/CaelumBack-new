"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Admin Loja NPC' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Admin Loja NPC 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Admin Loja NPC', '1.0', 'Bastidores: tela dedicada de preços da Loja NPC',
         'Novo módulo no Painel Administrativo pra ajustar rapidamente preço de compra, preço de venda e disponibilidade de qualquer item na Loja NPC, sem precisar abrir o editor completo de Itens. Não muda nada pra quem já joga — é ferramenta de bastidores.',
         'Ferramenta de bastidores: ajustar preços e disponibilidade da Loja NPC num só lugar.',
         false, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Admin Loja NPC", versao: "1.0" });
  },
};
