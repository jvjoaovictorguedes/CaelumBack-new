const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const MarketListing = sequelize.define(
  "MarketListing",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem_vendedor: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem_comprador: { type: DataTypes.INTEGER, allowNull: true },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    // Só preenchido pra equipamento (Inventário v2) — a instância
    // anunciada fica com estado "Mercado" (equipmentInstanceService.
    // reserveForMarket) até vender ou cancelar. Material/consumível
    // continua null e usa id_item+quantidade como sempre (stack).
    id_instancia: { type: DataTypes.INTEGER, allowNull: true },
    // quantidade_total nunca muda depois de criado — é o "quanto foi
    // anunciado". quantidade_restante decrementa a cada compra parcial de
    // stack (equipamento é sempre 1/1, nunca compra parcial — v2 §6).
    quantidade_total: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_restante: { type: DataTypes.INTEGER, allowNull: false },
    preco_unitario: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("Ativo", "Vendido", "Cancelado"),
      allowNull: false,
      defaultValue: "Ativo",
    },
    vendido_em: { type: DataTypes.DATE, allowNull: true },
    cancelado_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "market_listings" },
);

module.exports = MarketListing;
