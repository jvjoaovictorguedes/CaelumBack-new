const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Log de eventos da Encomenda (criada/contraproposta/aceita/recusada/
// cancelada/concluída) — histórico pra tela de negociação (Fase 9), não
// uma fonte de verdade (o estado de verdade é PlayerShopCommission +
// PlayerShopCommissionOffer).
const PlayerShopCommissionLog = sequelize.define(
  "PlayerShopCommissionLog",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    id_encomenda: { type: DataTypes.INTEGER, allowNull: false },
    evento: { type: DataTypes.STRING(40), allowNull: false },
    detalhes: { type: DataTypes.JSONB, allowNull: true },
  },
  { tableName: "player_shop_commission_logs" },
);

module.exports = PlayerShopCommissionLog;
