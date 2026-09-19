const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Espólio por zona (§13/§15) — identidade de loot própria por região,
// sem reaproveitar o pool genérico de Material da Expedição/dropService
// (§14: Aventura não deve virar fonte principal de recurso de
// Expedição). exclusivo_raro=true só entra no sorteio quando o
// encontro derrotado era o Raro da zona.
const AdventureZoneLoot = sequelize.define(
  "AdventureZoneLoot",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_area: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    peso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    quantidade_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    quantidade_max: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    exclusivo_raro: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureZoneLoots",
  },
);

module.exports = AdventureZoneLoot;
