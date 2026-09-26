// Um resgate = uma linha aqui. Constraint UNIQUE em (id_redemption_code,
// id_personagem) é a fonte de verdade de "só resgata uma vez por
// personagem" — nunca confiar só em checagem de aplicação, senão duas
// requisições quase simultâneas do mesmo jogador resgatam duas vezes.
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const RedemptionCodeUse = sequelize.define(
  "RedemptionCodeUse",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    id_redemption_code: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    resgatado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "redemption_code_uses", timestamps: false },
);

module.exports = RedemptionCodeUse;
