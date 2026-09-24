const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Threshold de um EquipmentSet (Especificação Sistema de Conjuntos
// §4.3). `stats` fica restrito aos atributos que equipmentBonusService
// já sabe somar com segurança (§4.4) — nunca um interpretador genérico
// de fórmulas. `effect_key` é resolvido por uma whitelist no código
// (ver equipmentSetEffectRegistry.js); o banco nunca guarda código
// executável.
const EquipmentSetBonus = sequelize.define(
  "EquipmentSetBonus",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    equipment_set_id: { type: DataTypes.INTEGER, allowNull: false },
    pieces_required: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    stats: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    effect_key: { type: DataTypes.STRING(100), allowNull: true },
    effect_config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    descricao: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "equipment_set_bonuses" },
);

module.exports = EquipmentSetBonus;
