"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Admin Mercado P2P' AND versao = '1.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Admin Mercado P2P 1.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, resumo, destaque, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Admin Mercado P2P', '1.0', 'Bastidores: moderação do Mercado P2P',
         'Novo módulo no Painel Administrativo pra consultar anúncios ativos do Mercado P2P e o histórico completo de vendas, com opção de cancelar um anúncio (devolvendo o item ao vendedor) quando necessário. Não muda nada pra quem já usa o Mercado — é ferramenta de bastidores.',
         'Ferramenta de bastidores: moderar anúncios e consultar o histórico de vendas do Mercado P2P.',
         false, CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Admin Mercado P2P", versao: "1.0" });
  },
};
