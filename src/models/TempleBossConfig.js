const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — identidade/calibração do Guardião (§8.2/
// §9.2/§11.1). Referencia um AdventureMonster como base (temple_exclusive,
// ai_profile ELITE_BOSS) — nunca um catálogo de monstro paralelo.
const TempleBossConfig = sequelize.define(
  "TempleBossConfig",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    id_monstro_base: { type: DataTypes.INTEGER, allowNull: false },
    nome_exibicao: { type: DataTypes.STRING(150), allowNull: true },
    lore: { type: DataTypes.TEXT, allowNull: true },
    target_turns_to_kill: { type: DataTypes.INTEGER, allowNull: true },
    target_boss_actions_survivable: { type: DataTypes.INTEGER, allowNull: true },
    scaling_min_multiplier: { type: DataTypes.FLOAT, allowNull: true },
    scaling_max_multiplier: { type: DataTypes.FLOAT, allowNull: true },
    reward_sigils_primeira_vitoria: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "temple_boss_configs" },
);

module.exports = TempleBossConfig;
