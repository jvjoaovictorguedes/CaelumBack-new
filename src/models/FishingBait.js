const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Isca (spec §8.4) — stack normal via Item.tipo_item = "Material"
// (atalho explícito da V1 pra não crescer o enum de Item); este vínculo
// é quem marca "esse Item é uma isca de Pesca". Nunca refinável.
const FishingBait = sequelize.define(
  "FishingBait",
  {
    id_item: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    nome_exibicao: { type: DataTypes.STRING(100), allowNull: true },
    nivel_pesca_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "fishing_baits" },
);

module.exports = FishingBait;
