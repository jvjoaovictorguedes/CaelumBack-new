"use strict";

// Marketplace P2P — separado da Loja (Items/shopController): aqui quem
// vende é outro jogador, não o sistema. O item anunciado sai do
// inventário do vendedor assim que o anúncio é criado (fica "em
// custódia" implícita na própria listing) e só volta pra ele se o
// anúncio for cancelado — assim não dá pra anunciar o mesmo item duas
// vezes nem usar um item que já está à venda.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("market_listings")) return;

    await queryInterface.createTable("market_listings", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      id_personagem_vendedor: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      id_personagem_comprador: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Characters", key: "id" },
        onDelete: "SET NULL",
      },
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Items", key: "id" },
        onDelete: "CASCADE",
      },
      quantidade: { type: Sequelize.INTEGER, allowNull: false },
      preco_unitario: { type: Sequelize.INTEGER, allowNull: false },
      status: {
        type: Sequelize.ENUM("Ativo", "Vendido", "Cancelado"),
        allowNull: false,
        defaultValue: "Ativo",
      },
      vendido_em: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    // Acelera a query mais comum da tela (listar anúncios ativos).
    await queryInterface.addIndex("market_listings", ["status"]);
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("market_listings")) {
      await queryInterface.dropTable("market_listings");
    }
  },
};
