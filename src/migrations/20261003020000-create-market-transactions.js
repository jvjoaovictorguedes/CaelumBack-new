"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("market_transactions")) {
      console.log('[migration] "market_transactions" já existe — pulando.');
      return;
    }

    await queryInterface.createTable("market_transactions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_listing: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "market_listings", key: "id" },
      },
      id_personagem_vendedor: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
      },
      id_personagem_comprador: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
      },
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Items", key: "id" },
      },
      id_instancia: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "character_equipment_instances", key: "id" },
      },
      refinamento: { type: Sequelize.INTEGER, allowNull: true },
      quantidade: { type: Sequelize.INTEGER, allowNull: false },
      preco_unitario: { type: Sequelize.INTEGER, allowNull: false },
      preco_total: { type: Sequelize.INTEGER, allowNull: false },
      taxa: { type: Sequelize.INTEGER, allowNull: false },
      valor_liquido_vendedor: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex("market_transactions", ["id_listing"]);
    await queryInterface.addIndex("market_transactions", ["id_item"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("market_transactions");
  },
};
