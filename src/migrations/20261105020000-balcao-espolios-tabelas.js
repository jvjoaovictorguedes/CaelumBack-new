"use strict";

// Balcão de Espólios — Venda, Encomendas e Reputação da Guilda dos
// Aventureiros (ver Especificação "Balcão de Espólios"). Reaproveita
// character_adventure_guild_progress (só adiciona reputacao_encomendas)
// e cria as tabelas novas do domínio comercial: preferências por
// espólio, histórico de venda e o ciclo de 5 encomendas por janela de
// 4h — tudo independente da rotação de 6h dos contratos de Rank.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    const colunasProgresso = await queryInterface.describeTable("character_adventure_guild_progress");
    if (!colunasProgresso.reputacao_encomendas) {
      await queryInterface.addColumn("character_adventure_guild_progress", "reputacao_encomendas", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!tabelas.includes("character_spoil_preferences")) {
      await queryInterface.createTable("character_spoil_preferences", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_item: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Items", key: "id" } },
        protegido_venda: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        quantidade_reservada: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("character_spoil_preferences", ["id_personagem", "id_item"], {
        unique: true,
        name: "character_spoil_preferences_personagem_item_unique",
      });
    }

    if (!tabelas.includes("character_spoil_sales")) {
      await queryInterface.createTable("character_spoil_sales", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        total_ouro: { type: Sequelize.INTEGER, allowNull: false },
        idempotency_key: { type: Sequelize.STRING(100), allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("character_spoil_sales", ["id_personagem", "idempotency_key"], {
        unique: true,
        name: "character_spoil_sales_personagem_idempotency_unique",
      });
    }

    if (!tabelas.includes("character_spoil_sale_items")) {
      await queryInterface.createTable("character_spoil_sale_items", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_sale: { type: Sequelize.INTEGER, allowNull: false, references: { model: "character_spoil_sales", key: "id" }, onDelete: "CASCADE" },
        id_item: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Items", key: "id" } },
        quantidade: { type: Sequelize.INTEGER, allowNull: false },
        valor_unitario_snapshot: { type: Sequelize.INTEGER, allowNull: false },
        total_linha: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("character_spoil_sale_items", ["id_sale"], {
        name: "character_spoil_sale_items_sale_idx",
      });
    }

    if (!tabelas.includes("character_spoil_order_cycles")) {
      await queryInterface.createTable("character_spoil_order_cycles", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        janela_inicio: { type: Sequelize.DATE, allowNull: false },
        janela_fim: { type: Sequelize.DATE, allowNull: false },
        bonus_lote_concedido: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        bonus_reputacao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        bonus_percentual: { type: Sequelize.DECIMAL(5, 4), allowNull: true },
        bonus_ouro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("character_spoil_order_cycles", ["id_personagem", "janela_inicio"], {
        unique: true,
        name: "character_spoil_order_cycles_personagem_janela_unique",
      });
    }

    if (!tabelas.includes("character_spoil_orders")) {
      await queryInterface.createTable("character_spoil_orders", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_ciclo: { type: Sequelize.INTEGER, allowNull: false, references: { model: "character_spoil_order_cycles", key: "id" }, onDelete: "CASCADE" },
        ordem: { type: Sequelize.INTEGER, allowNull: false },
        id_item: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Items", key: "id" } },
        quantidade_exigida: { type: Sequelize.INTEGER, allowNull: false },
        valor_unitario_snapshot: { type: Sequelize.INTEGER, allowNull: false },
        concluida_em: { type: Sequelize.DATE, allowNull: true },
        ouro_pago: { type: Sequelize.INTEGER, allowNull: true },
        reputacao_paga: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("character_spoil_orders", ["id_ciclo", "ordem"], {
        unique: true,
        name: "character_spoil_orders_ciclo_ordem_unique",
      });
      await queryInterface.addIndex("character_spoil_orders", ["id_item"], {
        name: "character_spoil_orders_item_idx",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_spoil_orders");
    await queryInterface.dropTable("character_spoil_order_cycles");
    await queryInterface.dropTable("character_spoil_sale_items");
    await queryInterface.dropTable("character_spoil_sales");
    await queryInterface.dropTable("character_spoil_preferences");
    await queryInterface.removeColumn("character_adventure_guild_progress", "reputacao_encomendas");
  },
};
