const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Loja do Aventureiro V2 §6 — demanda do lojista (ele COMPRA de outros
// jogadores). ouro_reservado é o escrow restante: debitado inteiro do
// lojista na criação, zerado aos poucos conforme cada entrega paga o
// fornecedor; status + ouro_reservado==0 juntos provam reembolso feito.
const PlayerShopDemand = sequelize.define(
  "PlayerShopDemand",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_desejada: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_entregue: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    preco_unitario: { type: DataTypes.INTEGER, allowNull: false },
    ouro_reservado: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("Aberta", "Concluida", "Cancelada", "Expirada"),
      allowNull: false,
      defaultValue: "Aberta",
    },
    prazo_expiracao: { type: DataTypes.DATE, allowNull: false },
    concluido_em: { type: DataTypes.DATE, allowNull: true },
    cancelado_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "player_shop_demands" },
);

module.exports = PlayerShopDemand;
