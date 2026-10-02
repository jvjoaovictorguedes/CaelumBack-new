const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Loja do Aventureiro V2 §7 — Encomenda (negociação direcionada entre
// cliente e lojista). Termos (quantidade/preço/prazo) só existem de
// verdade quando ACEITA — até lá, quem manda é a Offer mais recente
// (ver PlayerShopCommissionOffer).
const PlayerShopCommission = sequelize.define(
  "PlayerShopCommission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    id_personagem_lojista: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem_cliente: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM(
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
    proposal_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    quantidade_acordada: { type: DataTypes.INTEGER, allowNull: true },
    preco_unitario_acordado: { type: DataTypes.INTEGER, allowNull: true },
    preco_total_acordado: { type: DataTypes.INTEGER, allowNull: true },
    id_instancia_acordada: { type: DataTypes.INTEGER, allowNull: true },
    ouro_reservado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    prazo_negociacao: { type: DataTypes.DATE, allowNull: false },
    prazo_entrega: { type: DataTypes.DATE, allowNull: true },
    aceito_em: { type: DataTypes.DATE, allowNull: true },
    concluido_em: { type: DataTypes.DATE, allowNull: true },
    recusado_em: { type: DataTypes.DATE, allowNull: true },
    cancelado_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "player_shop_commissions" },
);

module.exports = PlayerShopCommission;
