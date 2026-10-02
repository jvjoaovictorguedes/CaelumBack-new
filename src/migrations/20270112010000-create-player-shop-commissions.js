"use strict";

// Loja do Aventureiro V2 §7 — Encomenda: negociação DIRECIONADA entre
// cliente e lojista (ao contrário da Demanda, que é aberta pra
// qualquer fornecedor). Cada proposta/contraproposta é um
// PlayerShopCommissionOffer IMUTÁVEL e versionado — aceitar precisa
// revalidar status + proposal_version juntos (evita aceitar uma
// proposta já superada sob concorrência). Termos só travam (preço/
// quantidade/prazo) no momento em que uma Offer é aceita — é aí,
// exatamente uma vez, que o ouro do cliente é reservado.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("player_shop_commissions", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_personagem_lojista: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      },
      id_personagem_cliente: {
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
      descricao: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM(
          "AguardandoLojista",
          "AguardandoCliente",
          "Aceita",
          "ProntaEntrega",
          "Concluida",
          "Recusada",
          "Cancelada",
          "Expirada",
        ),
        allowNull: false,
        defaultValue: "AguardandoLojista",
      },
      proposal_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      // Termos congelados no momento do ACEITE (§7: "Accept must freeze
      // terms") — nulos enquanto ainda está negociando.
      quantidade_acordada: { type: Sequelize.INTEGER, allowNull: true },
      preco_unitario_acordado: { type: Sequelize.INTEGER, allowNull: true },
      preco_total_acordado: { type: Sequelize.INTEGER, allowNull: true },
      id_instancia_acordada: { type: Sequelize.INTEGER, allowNull: true },
      ouro_reservado: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      prazo_negociacao: { type: Sequelize.DATE, allowNull: false },
      prazo_entrega: { type: Sequelize.DATE, allowNull: true },
      aceito_em: { type: Sequelize.DATE, allowNull: true },
      concluido_em: { type: Sequelize.DATE, allowNull: true },
      recusado_em: { type: Sequelize.DATE, allowNull: true },
      cancelado_em: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("player_shop_commissions", ["id_personagem_lojista", "status"], {
      name: "player_shop_commissions_lojista_status_idx",
    });
    await queryInterface.addIndex("player_shop_commissions", ["id_personagem_cliente", "status"], {
      name: "player_shop_commissions_cliente_status_idx",
    });

    await queryInterface.createTable("player_shop_commission_offers", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_encomenda: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "player_shop_commissions", key: "id" },
        onDelete: "CASCADE",
      },
      proposal_version: { type: Sequelize.INTEGER, allowNull: false },
      autor: { type: Sequelize.ENUM("Lojista", "Cliente"), allowNull: false },
      quantidade: { type: Sequelize.INTEGER, allowNull: false },
      preco_unitario: { type: Sequelize.INTEGER, allowNull: false },
      prazo_entrega_dias: { type: Sequelize.INTEGER, allowNull: false },
      mensagem: { type: Sequelize.TEXT, allowNull: true },
      status: {
        type: Sequelize.ENUM("Pendente", "Aceita", "Superada", "Recusada"),
        allowNull: false,
        defaultValue: "Pendente",
      },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("player_shop_commission_offers", ["id_encomenda", "proposal_version"], {
      name: "player_shop_commission_offers_encomenda_versao_idx",
      unique: true,
    });

    await queryInterface.createTable("player_shop_commission_logs", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      id_encomenda: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "player_shop_commissions", key: "id" },
        onDelete: "CASCADE",
      },
      evento: { type: Sequelize.STRING(40), allowNull: false },
      detalhes: { type: Sequelize.JSONB, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await queryInterface.addIndex("player_shop_commission_logs", ["id_encomenda"], {
      name: "player_shop_commission_logs_encomenda_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("player_shop_commission_logs");
    await queryInterface.dropTable("player_shop_commission_offers");
    await queryInterface.dropTable("player_shop_commissions");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_player_shop_commissions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_player_shop_commission_offers_autor";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_player_shop_commission_offers_status";');
  },
};
