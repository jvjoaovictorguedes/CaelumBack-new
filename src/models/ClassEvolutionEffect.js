const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Classes V2 §10 — efeito mecânico configurável de uma evolução, com
// catálogo FECHADO de effect_key (nunca lógica arbitrária vinda do
// banco). O ENUM abaixo documenta o catálogo inteiro do desenho
// original, mas o Admin só deixa CRIAR/EDITAR um efeito cuja effect_key
// esteja em classEvolutionEffectService.EFFECT_KEYS_IMPLEMENTADAS — as
// demais existem no schema pra o catálogo bater com a spec, mas nunca
// aparecem como opção selecionável nem são interpretadas em combate
// enquanto não tiverem esse service atualizado (nunca aceitas
// silenciosamente: rejeitadas com 400 se alguém tentar criar uma).
const ClassEvolutionEffect = sequelize.define(
  "ClassEvolutionEffect",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_evolucao: { type: DataTypes.INTEGER, allowNull: false },
    effect_key: {
      type: DataTypes.ENUM(
        "RAGE_STACK",
        "LIFESTEAL",
        "LOW_HP_DAMAGE",
        "DAMAGE_REDUCTION",
        "MANA_COST_REDUCTION",
        "COOLDOWN_REDUCTION",
        "CRITICAL_CHANCE",
        "CRITICAL_DAMAGE",
        "DODGE_BONUS",
        "HEALING_BONUS",
        "SHIELD_ON_CAST",
      ),
      allowNull: false,
    },
    valor: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    config: { type: DataTypes.JSONB, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "class_evolution_effects",
  },
);

module.exports = ClassEvolutionEffect;
