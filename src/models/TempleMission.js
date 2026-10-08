const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — catálogo de Provações de UM evento (§4.1).
// PROVACAO_FINAL nunca é uma linha aqui (ver templeConfig.js) — é o
// estado do Guardião individual (CharacterTempleProgress/
// TempleBossAttempt).
const TempleMission = sequelize.define(
  "TempleMission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false },
    categoria: { type: DataTypes.ENUM("RITO_DIARIO", "PROVACAO_PRINCIPAL"), allowNull: false },
    objective_type: {
      type: DataTypes.ENUM(
        "WIN_ADVENTURE_NO_CONSUMABLE",
        "APPLY_STATUS",
        "DEFEAT_AFFECTED_BY_STATUS",
        "WIN_DISTINCT_ZONES",
        "FINAL_BLOW_WITH_POWER",
        "CRAFT_RARITY_OR_HIGHER",
        "COMPLETE_EXPEDITIONS",
        "PARTY_ADVENTURE_WINS",
        "DELIVER_ITEM",
        "CLEANSE_STATUS",
      ),
      allowNull: false,
    },
    objective_config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    meta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    reward_sigils: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    nome_exibicao: { type: DataTypes.STRING(150), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "temple_missions" },
);

module.exports = TempleMission;
