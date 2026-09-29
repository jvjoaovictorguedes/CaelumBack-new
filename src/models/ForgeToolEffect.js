const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Profissão de Ferreiro §9.3 — effect keys WHITELISTED (nunca fórmula
// livre no banco). valor_ppm é sempre partes-por-milhão, mesma unidade
// do resto da Forja (0 a 1.000.000).
const CHAVES_VALIDAS = ["SMELTING_BONUS_BAR_PPM", "CRAFTING_QUALITY_BONUS_PPM", "REFINEMENT_SUCCESS_BONUS_PPM"];

const ForgeToolEffect = sequelize.define(
  "ForgeToolEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    effect_key: { type: DataTypes.ENUM(...CHAVES_VALIDAS), allowNull: false },
    valor_ppm: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 1_000_000 } },
  },
  { tableName: "forge_tool_effects", timestamps: false },
);

ForgeToolEffect.CHAVES_VALIDAS = CHAVES_VALIDAS;

module.exports = ForgeToolEffect;
