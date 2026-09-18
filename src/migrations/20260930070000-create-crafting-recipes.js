"use strict";

// Forja v2 — 3 tabelas novas, sem mexer nas antigas (craftingService.js/
// craftingController.js da v1 são substituídos por completo, ver
// 20260930080000 pra seed das receitas).
//
// crafting_recipes: 1 linha por item forjável, com tempo e custo em
// ouro (id_item é UNIQUE — só existe 1 receita por item final).
// crafting_recipe_ingredients: N linhas por receita (os materiais e
// quantidade que ela consome).
// character_crafting_queue: no máximo 1 linha por personagem (id_item
// é a PK) — representa a forja em andamento; é apagada quando o
// jogador coleta o item pronto, liberando o "slot" pra próxima forja.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("crafting_recipes")) {
      await queryInterface.createTable("crafting_recipes", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "Items", key: "id" },
          onDelete: "CASCADE",
        },
        tempo_segundos: { type: Sequelize.INTEGER, allowNull: false },
        ouro_custo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("crafting_recipe_ingredients")) {
      await queryInterface.createTable("crafting_recipe_ingredients", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        id_receita: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "crafting_recipes", key: "id" },
          onDelete: "CASCADE",
        },
        id_item_material: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("crafting_recipe_ingredients", ["id_receita"]);
    }

    if (!tabelas.includes("character_crafting_queue")) {
      await queryInterface.createTable("character_crafting_queue", {
        id_personagem: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_receita: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "crafting_recipes", key: "id" },
          onDelete: "CASCADE",
        },
        iniciado_em: { type: Sequelize.DATE, allowNull: false },
        pronto_em: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_crafting_queue")) {
      await queryInterface.dropTable("character_crafting_queue");
    }
    if (tabelas.includes("crafting_recipe_ingredients")) {
      await queryInterface.dropTable("crafting_recipe_ingredients");
    }
    if (tabelas.includes("crafting_recipes")) {
      await queryInterface.dropTable("crafting_recipes");
    }
  },
};
