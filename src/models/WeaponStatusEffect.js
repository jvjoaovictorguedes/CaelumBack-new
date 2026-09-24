const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Efeito de status configurável por ARMA (Evolução do Motor de Status
// §12.1) — opt-in: uma arma sem nenhuma linha aqui continua normal.
// `id_item` referencia WeaponProperties.id_item (não Item.id
// diretamente), reforçando no schema que só armas de verdade recebem
// isso. Whitelist de status_key validada no service (nunca confiar em
// valor cru vindo do banco pra executar código).
const WeaponStatusEffect = sequelize.define(
  "WeaponStatusEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    status_key: { type: DataTypes.STRING(20), allowNull: false },
    chance_ppm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    duration_turns: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    potency_base: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    potency_scale_attribute: {
      type: DataTypes.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
      allowNull: true,
    },
    potency_scale_value: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    // v1: só BASIC_ATTACK_HIT dispara proc de arma (§13).
    trigger: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "BASIC_ATTACK_HIT" },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "weapon_status_effects" },
);

module.exports = WeaponStatusEffect;
