const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const MonsterAbility = require("./MonsterAbility");

// IA de Combate PvE & Habilidades de Monstros V1 (§4.3) — condição
// opcional de uma MonsterAbility. condition_key é SEMPRE whitelist (ver
// config/monsterAbilityConfig.js), config nunca guarda expressão/eval,
// só parâmetros conhecidos do schema daquela chave.
const MonsterAbilityCondition = sequelize.define(
  "MonsterAbilityCondition",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_monster_ability: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: MonsterAbility, key: "id" },
    },
    condition_key: { type: DataTypes.STRING(40), allowNull: false },
    config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    score_bonus: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "monster_ability_conditions" },
);

module.exports = MonsterAbilityCondition;
