const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Power = require("./Power");

// Habilidades V2.0 (doc "Habilidades V2.0" §7/§8/§9) — Fase 4. Modificador
// de combate configurável de uma Power: buff/debuff numérico, escudo,
// regen, lifesteal, crítico, cura, Mana, cooldown, dispel e gatilho —
// tudo que PowerStatusEffect (Status de verdade: Burn/Bleed/Poison/
// Stun/...) não representa. Uma Power pode ter zero, uma ou várias
// linhas (ex.: uma passiva com +crítico E +lifesteal ao mesmo tempo).
//
// effect_key/trigger/target/reapply_policy são SEMPRE whitelist dos
// catálogos centrais (combatModifierConfig/combatTriggerConfig) —
// nunca eval, nunca fórmula/SQL/JS vinda do banco (§27).
const PowerCombatEffect = sequelize.define(
  "PowerCombatEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_power: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Power, key: "id" },
    },
    effect_key: { type: DataTypes.STRING(40), allowNull: false },
    target: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "SELF" },
    trigger: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "PASSIVE" },

    magnitude_base: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    // Escala opcional por atributo do portador — null = magnitude fixa.
    scale_attribute: {
      type: DataTypes.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
      allowNull: true,
    },
    scale_value: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    // Usa a curva de abilityLevelService (nível 1-10 da própria Power
    // aprendida) quando habilitado — mesma curva que já multiplica
    // dano_base/cura_base/custo_mana.
    scale_with_ability_level: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Partes por milhão (1.000.000 = 100%) — mesmo padrão de
    // PowerStatusEffect.chance_ppm, nunca FLOAT direto pra chance.
    chance_ppm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1_000_000 },
    duration_turns: { type: DataTypes.INTEGER, allowNull: true },

    stack_group: { type: DataTypes.STRING(60), allowNull: true },
    reapply_policy: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "STRONGEST" },
    max_stacks: { type: DataTypes.INTEGER, allowNull: true },

    condition_key: { type: DataTypes.STRING(40), allowNull: true },
    condition_config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

    dispellable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Config extra tipada por effect_key (ex.: status_key alvo de
    // CLEANSE_STATUS) — nunca lógica/expressão arbitrária.
    config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },

    // Contexto permitido (§11/§17) — mesmo padrão allow_* de
    // UniquePowerEffect/uniqueFeatConfig.POWER_EFFECT_CONTEXT_COLUMNS,
    // mas por padrão TODOS permitidos (§11: "passivas funcionam em
    // PvE/PvP por default; restrição é sempre explícita").
    allow_pve: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_party: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_guild_boss: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_world_boss: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_pvp_casual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_ranked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_tournament: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "power_combat_effects" },
);

module.exports = PowerCombatEffect;
