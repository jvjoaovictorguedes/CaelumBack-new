const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const GuildBossConfig = require("./GuildBossConfig");
const Power = require("./Power");

// IA de Combate PvE & Habilidades de Monstros V1 (§8.3/§11.1 item 5) —
// habilidade de combate do chefe da guilda, mesma forma de
// MonsterAbility mas vinculada a GuildBossConfig (um por Rank F..S) em
// vez de AdventureMonster. O adapter de Guild Boss converte isto pro DTO
// comum do combatAiService; HEAL_HP/REGEN_HP/SHIELD são proibidos aqui
// (§7 "Hard rule de Boss coletivo") — a validação de verdade mora em
// monsterAbilityService, não só no schema.
const GuildBossAbility = sequelize.define(
  "GuildBossAbility",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild_boss_config: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: GuildBossConfig, key: "id" },
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
  { tableName: "guild_boss_abilities" },
);

module.exports = GuildBossAbility;
