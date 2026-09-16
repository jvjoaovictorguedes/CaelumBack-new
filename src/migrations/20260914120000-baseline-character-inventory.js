"use strict";

// Baseline: tableName explícito no model ("character_inventory"), sem
// ambiguidade — só checa existência e cria se faltar.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("character_inventory")) {
      console.log('[migration] Tabela "character_inventory" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("character_inventory", {
      id_personagem_inventario: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
      },
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Items", key: "id" },
      },
      quantidade: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
      equipado: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
    });
  },

  async down() {
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "character_inventory" em produção).',
    );
  },
};
