const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — resistência/imunidade de status do
// Guardião (§8.3), congelada no evento.
const TempleBossStatusResistance = sequelize.define(
  "TempleBossStatusResistance",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    status_key: { type: DataTypes.STRING(40), allowNull: false },
    imune: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    resistencia_pct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "temple_boss_status_resistances" },
);

module.exports = TempleBossStatusResistance;
