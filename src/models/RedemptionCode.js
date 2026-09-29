// Código de resgate criado por um admin — jogador digita o texto em
// Meu Personagem > Informações e recebe o pacote de recompensa (ouro/
// xp/itens, ver rewardPayoutService.aplicarPacoteDeRecompensa) uma
// única vez por personagem (ver RedemptionCodeUse). `recompensa` usa o
// MESMO formato JSON de Premiações — não é coincidência, os dois
// aplicam via a mesma função.
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const RedemptionCode = sequelize.define(
  "RedemptionCode",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    codigo: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    recompensa: { type: DataTypes.JSONB, allowNull: false },
    expira_em: { type: DataTypes.DATE, allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    id_admin_criador: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "redemption_codes" },
);

module.exports = RedemptionCode;
