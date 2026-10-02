"use strict";

// Loja do Aventureiro V2 §6 — "Demanda" é o lojista publicando uma
// COMPRA (ele quer receber um item de outros jogadores, não vender).
// Ouro é reservado (debitado) INTEIRO na criação — "o jogador não
// consegue publicar uma demanda sem já ter reservado todo o ouro
// necessário" — e ouro_reservado vai sendo zerado conforme cada entrega
// paga o fornecedor direto. status + ouro_reservado==0 juntos provam
// se o cancelamento/expiração já foi (ou não) reembolsado — chave pro
// reembolso idempotente (nunca credita duas vezes num cancel chamado
// duas vezes).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("player_shop_demands", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_personagem: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      id_item: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Items", key: "id" },
        onDelete: "RESTRICT",
      },
      quantidade_desejada: { type: Sequelize.INTEGER, allowNull: false },
      quantidade_entregue: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      preco_unitario: { type: Sequelize.INTEGER, allowNull: false },
      ouro_reservado: { type: Sequelize.INTEGER, allowNull: false },
      status: {
        type: Sequelize.ENUM("Aberta", "Concluida", "Cancelada", "Expirada"),
        allowNull: false,
        defaultValue: "Aberta",
      },
      prazo_expiracao: { type: Sequelize.DATE, allowNull: false },
      concluido_em: { type: Sequelize.DATE, allowNull: true },
      cancelado_em: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("player_shop_demands", ["id_personagem", "status"], {
      name: "player_shop_demands_personagem_status_idx",
    });
    await queryInterface.addIndex("player_shop_demands", ["status", "prazo_expiracao"], {
      name: "player_shop_demands_status_prazo_idx",
    });

    await queryInterface.createTable("player_shop_demand_deliveries", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_demanda: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "player_shop_demands", key: "id" },
        onDelete: "CASCADE",
      },
      id_personagem_fornecedor: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      quantidade: { type: Sequelize.INTEGER, allowNull: false },
      valor_pago: { type: Sequelize.INTEGER, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("player_shop_demand_deliveries", ["id_demanda"], {
      name: "player_shop_demand_deliveries_demanda_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("player_shop_demand_deliveries");
    await queryInterface.dropTable("player_shop_demands");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_player_shop_demands_status";');
  },
};
