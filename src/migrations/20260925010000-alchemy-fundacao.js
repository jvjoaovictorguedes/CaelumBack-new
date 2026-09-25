"use strict";

// Alquimia / "Caldeirão" — Fase 1 (Fundação). Domínio próprio, não uma
// extensão da Forja (spec §3/§36): tabelas de receita/ingrediente têm
// nome e estrutura independentes de forge_blueprints, e referenciam
// Item.id diretamente (nunca id_monstro/id_recurso como dependência de
// runtime — spec §7/§18).
//
// ConsumableEffect entra na mesma migration (spec §6.5/§11/§12): motor
// novo de efeitos de consumível, sem reativar
// efeito_atributo/valor_atributo/duracao_efeito legados de
// consumable_properties.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("alchemy_recipes")) {
      await queryInterface.createTable("alchemy_recipes", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(120), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        categoria: {
          type: Sequelize.ENUM("POCAO", "ANTIDOTO", "TONICO", "ELIXIR", "PREPARADO"),
          allowNull: false,
        },
        id_item_resultado: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade_resultado: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        nivel_alquimia_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        xp_alquimia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        custo_ouro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        modo_desbloqueio: { type: Sequelize.ENUM("NIVEL", "DESCOBERTA"), allowNull: false, defaultValue: "NIVEL" },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("alchemy_recipe_ingredients")) {
      await queryInterface.createTable("alchemy_recipe_ingredients", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_recipe: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "alchemy_recipes", key: "id" },
          onDelete: "CASCADE",
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade: { type: Sequelize.INTEGER, allowNull: false },
      });
      await queryInterface.addConstraint("alchemy_recipe_ingredients", {
        fields: ["id_recipe", "id_item"],
        type: "unique",
        name: "alchemy_recipe_ingredients_recipe_item_unique",
      });
    }

    if (!tabelas.includes("character_alchemy_progress")) {
      await queryInterface.createTable("character_alchemy_progress", {
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        nivel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        experiencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_produzido: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      });
    }

    if (!tabelas.includes("character_alchemy_recipe_unlocks")) {
      await queryInterface.createTable("character_alchemy_recipe_unlocks", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_recipe: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "alchemy_recipes", key: "id" },
          onDelete: "CASCADE",
        },
        source_key: { type: Sequelize.STRING(80), allowNull: true },
        desbloqueada_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("character_alchemy_recipe_unlocks", {
        fields: ["id_personagem", "id_recipe"],
        type: "unique",
        name: "character_alchemy_recipe_unlocks_personagem_recipe_unique",
      });
    }

    // Idempotência de brew (spec §14/§15/§28) — guarda o resultado da
    // primeira execução de uma idempotencyKey pra retries devolverem a
    // mesma resposta sem duplicar débito/crédito/XP.
    if (!tabelas.includes("alchemy_brew_idempotency")) {
      await queryInterface.createTable("alchemy_brew_idempotency", {
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        idempotency_key: { type: Sequelize.STRING(120), allowNull: false, primaryKey: true },
        id_recipe: { type: Sequelize.INTEGER, allowNull: false },
        resultado: { type: Sequelize.JSONB, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    // ConsumableEffect (spec §6.5) — motor novo de efeitos, whitelist de
    // effect_key resolvida em código (consumableEffectRegistry.js), nunca
    // reaproveitando efeito_atributo/valor_atributo/duracao_efeito.
    if (!tabelas.includes("consumable_effects")) {
      await queryInterface.createTable("consumable_effects", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "CASCADE",
        },
        effect_key: { type: Sequelize.STRING(40), allowNull: false },
        magnitude: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        duration_turns: { type: Sequelize.INTEGER, allowNull: true },
        config: { type: Sequelize.JSONB, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("consumable_effects");
    await queryInterface.dropTable("alchemy_brew_idempotency");
    await queryInterface.dropTable("character_alchemy_recipe_unlocks");
    await queryInterface.dropTable("character_alchemy_progress");
    await queryInterface.dropTable("alchemy_recipe_ingredients");
    await queryInterface.dropTable("alchemy_recipes");
  },
};
