const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Cada proposta/contraproposta é IMUTÁVEL e versionada — nunca editada
// depois de criada. Aceitar revalida (id_encomenda, proposal_version)
// juntos, então uma oferta já superada nunca pode ser "aceita tarde".
const PlayerShopCommissionOffer = sequelize.define(
  "PlayerShopCommissionOffer",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    id_encomenda: { type: DataTypes.INTEGER, allowNull: false },
    proposal_version: { type: DataTypes.INTEGER, allowNull: false },
    autor: { type: DataTypes.ENUM("Lojista", "Cliente"), allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    preco_unitario: { type: DataTypes.INTEGER, allowNull: false },
    prazo_entrega_dias: { type: DataTypes.INTEGER, allowNull: false },
    mensagem: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("Pendente", "Aceita", "Superada", "Recusada"),
      allowNull: false,
      defaultValue: "Pendente",
    },
  },
  { tableName: "player_shop_commission_offers" },
);

module.exports = PlayerShopCommissionOffer;
