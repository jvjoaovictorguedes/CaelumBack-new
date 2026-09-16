"use strict";

// Baseline: tableName explícito no model ("consumable_properties"), então
// não há ambiguidade de nome aqui — só checa existência e cria se faltar.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("consumable_properties")) {
      console.log('[migration] Tabela "consumable_properties" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("consumable_properties", {
      id_item: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Items", key: "id" },
      },
      efeito_vida: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      efeito_mana: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      efeito_atributo: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      valor_atributo: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      duracao_efeito: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    });
  },

  async down() {
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "consumable_properties" em produção).',
    );
  },
};
