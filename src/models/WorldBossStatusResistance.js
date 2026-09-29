const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const { CHAVES_VALIDAS: STATUS_KEYS_VALIDAS } = require("../config/statusEffectConfig");

// Ameaça Mundial V2 §7.1 — imunidade/resistência do Boss a status do
// motor EXISTENTE (statusEffectConfig.js). Nunca um segundo sistema de
// status (§7 "obrigatório") — esta tabela só decide se um status pode
// entrar no Boss e com qual resistência; duração/potency/tick/stack
// continuam 100% do motor atual.
const WorldBossStatusResistance = sequelize.define(
  "WorldBossStatusResistance",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    // STRING validado contra a whitelist real do motor de status em vez
    // de ENUM de banco — evita duplicar/dessincronizar a lista toda vez
    // que statusEffectConfig ganhar uma chave nova (ver migration).
    status_key: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [STATUS_KEYS_VALIDAS] } },
    imune: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    resistencia_pct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "world_boss_status_resistances" },
);

module.exports = WorldBossStatusResistance;
