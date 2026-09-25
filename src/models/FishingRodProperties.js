const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Propriedades de uma Vara de Pesca (spec §9.3) — Item.tipo_item deve
// ser "Ferramenta". Escala 0..1000 (mesma amplitude usada por
// WeaponProperties/ArmorProperties pra reaproveitar a curva percentual
// da Forja); a UI pode exibir /10 sem perder precisão interna.
//
// NUNCA lido por equipmentBonusService/Combat Power — vara não é
// equipamento de combate (spec §9.1/§38).
const FishingRodProperties = sequelize.define(
  "FishingRodProperties",
  {
    id_item: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    forca_linha: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, validate: { min: 0, max: 1000 } },
    controle: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, validate: { min: 0, max: 1000 } },
    recolhimento: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, validate: { min: 0, max: 1000 } },
    precisao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, validate: { min: 0, max: 1000 } },
    estabilidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, validate: { min: 0, max: 1000 } },
    nivel_pesca_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  { tableName: "fishing_rod_properties" },
);

module.exports = FishingRodProperties;
