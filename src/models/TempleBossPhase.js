const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — fase do Guardião por %HP (§8.3), nunca
// dependente de build/Poder do jogador.
const TempleBossPhase = sequelize.define(
  "TempleBossPhase",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hp_threshold_pct: { type: DataTypes.INTEGER, allowNull: false },
    nome_exibicao: { type: DataTypes.STRING(150), allowNull: true },
    dano_multiplicador: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    defesa_multiplicador: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    enrage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: "temple_boss_phases" },
);

module.exports = TempleBossPhase;
