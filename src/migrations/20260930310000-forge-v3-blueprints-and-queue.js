"use strict";

// ETAPA 4/5/7 da Forja v3: barras (forge_bar_items), blueprints
// (ForgeBlueprint/Ingredient/Result), pergaminhos (forge_scrolls/
// forge_scroll_ingredients) e a nova fila com slots (character_forge_queue).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    // Vincula recurso de Mineração + qualidade -> Item "Barra de X — Y",
    // mesmo padrão de expedition_resource_items (nunca resolver por nome).
    if (!tabelas.includes("forge_bar_items")) {
      await queryInterface.createTable("forge_bar_items", {
        id_recurso: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "expedition_resources", key: "id" },
          onDelete: "CASCADE",
        },
        qualidade: {
          type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
          allowNull: false,
          primaryKey: true,
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
      });
    }

    if (!tabelas.includes("forge_blueprints")) {
      await queryInterface.createTable("forge_blueprints", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        // Mesmos valores de tipo_item usados pelo boneco de papel — decide
        // em qual slot o resultado pode ser equipado.
        categoria_equipamento: {
          type: Sequelize.ENUM("Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"),
          allowNull: false,
        },
        multiplicador_tempo: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        nivel_forja_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    // Ingrediente "genérico": aponta pro RECURSO (barra de minério ou
    // recurso cru de Silvicultura/Exploração), não pro Item concreto —
    // o Item de verdade só é resolvido na hora de fabricar, cruzando com
    // a qualidade escolhida pelo jogador (via forge_bar_items ou
    // expedition_resource_items). É isso que garante "todos os
    // ingredientes principais na mesma qualidade" (spec §12).
    if (!tabelas.includes("forge_blueprint_ingredients")) {
      await queryInterface.createTable("forge_blueprint_ingredients", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_blueprint: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "forge_blueprints", key: "id" },
          onDelete: "CASCADE",
        },
        tipo_insumo: { type: Sequelize.ENUM("Barra", "RecursoExpedicao"), allowNull: false },
        id_recurso: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "expedition_resources", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade_base: { type: Sequelize.INTEGER, allowNull: false },
      });
    }

    if (!tabelas.includes("forge_blueprint_results")) {
      await queryInterface.createTable("forge_blueprint_results", {
        id_blueprint: {
          type: Sequelize.INTEGER,
          allowNull: false,
          primaryKey: true,
          references: { model: "forge_blueprints", key: "id" },
          onDelete: "CASCADE",
        },
        qualidade: {
          type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
          allowNull: false,
          primaryKey: true,
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
      });
    }

    if (!tabelas.includes("forge_scrolls")) {
      await queryInterface.createTable("forge_scrolls", {
        id_item: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "CASCADE",
        },
        bonus_percentual: { type: Sequelize.INTEGER, allowNull: false },
        nivel_forja_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        tempo_segundos: { type: Sequelize.INTEGER, allowNull: false },
      });
    }

    if (!tabelas.includes("forge_scroll_ingredients")) {
      await queryInterface.createTable("forge_scroll_ingredients", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_scroll_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "forge_scrolls", key: "id_item" },
          onDelete: "CASCADE",
        },
        id_item_material: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade: { type: Sequelize.INTEGER, allowNull: false },
      });
    }

    // Fila com 2 slots independentes (Fundicao / Forja) por personagem —
    // substitui character_crafting_queue (Forge v2), que fica intocada
    // (não removida) pra não quebrar nada que ainda dependa dela.
    if (!tabelas.includes("character_forge_queue")) {
      await queryInterface.createTable("character_forge_queue", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        slot: { type: Sequelize.ENUM("Fundicao", "Forja"), allowNull: false },
        tipo_acao: { type: Sequelize.ENUM("Fundicao", "Fabricacao", "Refinamento", "Pergaminho"), allowNull: false },
        // Guarda o essencial pra exibir/coletar (id do blueprint, item,
        // instância etc.) — schema livre de propósito, cada tipo_acao usa
        // o formato que precisa.
        referencia: { type: Sequelize.JSONB, allowNull: false },
        // Resultado JÁ SORTEADO no momento de iniciar e nunca revelado
        // antes da coleta (spec §49) — evita restart/retry/coleta dupla
        // rerrolarem o resultado.
        payload_resultado: { type: Sequelize.JSONB, allowNull: false },
        iniciado_em: { type: Sequelize.DATE, allowNull: false },
        pronto_em: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      // 1 trabalho por slot por personagem — nunca 2 fundições ou 2
      // fabricações/refinamentos ao mesmo tempo no mesmo slot.
      await queryInterface.addConstraint("character_forge_queue", {
        fields: ["id_personagem", "slot"],
        type: "unique",
        name: "character_forge_queue_personagem_slot_unique",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_forge_queue");
    await queryInterface.dropTable("forge_scroll_ingredients");
    await queryInterface.dropTable("forge_scrolls");
    await queryInterface.dropTable("forge_blueprint_results");
    await queryInterface.dropTable("forge_blueprint_ingredients");
    await queryInterface.dropTable("forge_blueprints");
    await queryInterface.dropTable("forge_bar_items");
  },
};
