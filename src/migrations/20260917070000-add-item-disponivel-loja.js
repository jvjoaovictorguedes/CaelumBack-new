"use strict";

// Controle explícito de disponibilidade na loja. Antes, o front decidia
// sozinho quais itens mostrar (valor_venda > 0 e raridade != "Raro") e o
// backend confiava cegamente em qualquer id_item que /shop/purchase
// recebesse — dava pra comprar um item raro/não-comercializável direto
// pela API só sabendo o ID. Agora o servidor é a autoridade: só item com
// disponivel_loja = true pode ser comprado.
//
// O backfill abaixo preserva exatamente o comportamento atual da loja
// (mesmos itens que já apareciam pro jogador continuam disponíveis).
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Items");
    if ("disponivel_loja" in descricao) {
      console.log('[migration] "Items"."disponivel_loja" já existe — pulando.');
      return;
    }

    await queryInterface.addColumn("Items", "disponivel_loja", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Items"
      SET disponivel_loja = true
      WHERE valor_venda > 0 AND raridade <> 'Raro';
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Items", "disponivel_loja");
  },
};
