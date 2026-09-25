const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Motor NOVO de efeitos de consumível (spec §6.5/§11/§12) — nunca
// reativar efeito_atributo/valor_atributo/duracao_efeito de
// ConsumableProperties. effect_key é whitelist resolvida em código
// (consumableEffectRegistry.js); nenhum código executável/SQL dinâmico
// fica no banco, `config` é só dado (JSON) interpretado pelo handler.
const ConsumableEffect = sequelize.define(
  "ConsumableEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    effect_key: { type: DataTypes.STRING(40), allowNull: false },
    magnitude: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    duration_turns: { type: DataTypes.INTEGER, allowNull: true },
    config: { type: DataTypes.JSONB, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "consumable_effects" },
);

module.exports = ConsumableEffect;
