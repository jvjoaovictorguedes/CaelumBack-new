const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico imutável de cada entrega parcial/total feita numa
// PlayerShopDemand — usado pro extrato da loja e pras estatísticas
// (demandas_concluidas em playerShopService.obterPerfilPublico).
const PlayerShopDemandDelivery = sequelize.define(
  "PlayerShopDemandDelivery",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    id_demanda: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem_fornecedor: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    valor_pago: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "player_shop_demand_deliveries" },
);

module.exports = PlayerShopDemandDelivery;
