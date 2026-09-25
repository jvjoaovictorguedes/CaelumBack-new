const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Extensão controlada do Power pra mecânicas de Legado que não cabem nos
// campos normais de dano/cura/mana/cooldown/escala (§5.3). effect_key é
// SEMPRE uma whitelist do uniquePowerEffectRegistry — nunca eval, nunca
// fórmula/SQL/JS vinda do banco. id_power é PK e FK ao mesmo tempo:
// garante 1:1 real com Power (nunca duas linhas de efeito pro mesmo
// Power) sem depender de uma constraint UNIQUE separada.
const UniquePowerEffect = sequelize.define(
  "UniquePowerEffect",
  {
    id_power: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    effect_key: { type: DataTypes.STRING(60), allowNull: false },
    config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    allow_pve: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_party: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_guild_boss: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_world_boss: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    allow_pvp_casual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allow_ranked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    allow_tournament: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "unique_power_effects", timestamps: true },
);

module.exports = UniquePowerEffect;
