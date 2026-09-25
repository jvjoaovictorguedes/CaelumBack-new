const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Fases do boss (§11) — fase ativa quando hp_current/hp_max*100 <=
// hp_percentual_max; faixas não se sobrepõem (validado no service).
const WorldBossPhase = sequelize.define(
  "WorldBossPhase",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false },
    nome_fase: { type: DataTypes.STRING(100), allowNull: false },
    hp_percentual_max: { type: DataTypes.INTEGER, allowNull: false },
    modificador_dano_percentual: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    texto_alerta: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "world_boss_phases" },
);

module.exports = WorldBossPhase;
