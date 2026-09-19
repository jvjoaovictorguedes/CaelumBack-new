"use strict";

module.exports = {
  async up(queryInterface) {
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM patch_notes WHERE feature = 'Mercado' AND versao = '2.0' LIMIT 1;`,
    );
    if (existente.length > 0) {
      console.log("[migration] Nota Mercado 2.0 já existe — pulando.");
      return;
    }

    const [[{ max }]] = await queryInterface.sequelize.query(
      `SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`,
    );

    await queryInterface.sequelize.query(
      `INSERT INTO patch_notes (ordem, feature, versao, titulo, descricao, publicado_em, "createdAt", "updatedAt")
       VALUES (:ordem, 'Mercado', '2.0', 'Mercado ganhou compra parcial, filtros e histórico de preço',
         'Materiais e consumíveis empilháveis agora podem ser comprados aos poucos — o anúncio continua ativo até vender tudo, e cada compra parcial fica registrada separadamente. Equipamento continua sempre vendido como a instância inteira (com o refinamento dela). Novos filtros pra comprar: preço mínimo/máximo, refinamento mínimo e refinamento exato, e ordenação por preço, data ou refinamento. A listagem agora é paginada em vez de trazer tudo de uma vez. "Meus Anúncios" mostra quando um stack foi vendido só em parte e a receita líquida já acumulada dele. E cada card de equipamento no Mercado mostra as propriedades efetivas já considerando o refinamento — não precisa mais abrir a Forja pra saber se vale a pena comprar. Corrige também um equipamento anunciado podendo ser refinado enquanto estava à venda.',
         CURRENT_DATE, now(), now());`,
      { replacements: { ordem: max + 1 } },
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("patch_notes", { feature: "Mercado", versao: "2.0" });
  },
};
