const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const AdventureMonster = require("./AdventureMonster");
const Power = require("./Power");

// IA de Combate PvE & Habilidades de Monstros V1 (§4.2) — vínculo de uma
// Power (usage_scope MONSTER/BOTH) a um AdventureMonster como habilidade
// de combate (ativa ou passiva — ver §4.5: passiva nunca entra na
// seleção de ação, é aplicada no snapshot/COMBAT_START). Uma linha por
// Power; comportamento condicional fica em MonsterAbilityCondition.
const MonsterAbility = sequelize.define(
  "MonsterAbility",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_monstro: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: AdventureMonster, key: "id" },
    },
    id_power: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Power, key: "id" },
    },
    prioridade_base: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    peso_uso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    cooldown_override: { type: DataTypes.INTEGER, allowNull: true },
    custo_mana_override: { type: DataTypes.INTEGER, allowNull: true },
    target_policy: {
      type: DataTypes.ENUM("SELF", "PLAYER", "LOWEST_HP", "HIGHEST_HP", "RANDOM", "ALL"),
      allowNull: false,
      defaultValue: "PLAYER",
    },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ordem_admin: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "monster_abilities" },
);

module.exports = MonsterAbility;
