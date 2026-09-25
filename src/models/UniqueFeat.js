const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Proeza Única (Caelum_Proezas_Unicas_Claude.docx §5.1) — easter egg
// histórico do servidor: só pode ser reivindicada uma vez (ver a UNIQUE
// em UniqueFeatClaim.id_unique_feat, a autoridade real da unicidade).
// descricao_secreta_admin e trigger_config NUNCA saem em API pública —
// ver uniqueFeatPublicService.js.
const UniqueFeat = sequelize.define(
  "UniqueFeat",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    descricao_publica: { type: DataTypes.TEXT, allowNull: false },
    descricao_secreta_admin: { type: DataTypes.TEXT, allowNull: false },
    icone_url: { type: DataTypes.STRING(255), allowNull: true },
    categoria: { type: DataTypes.STRING(60), allowNull: true },
    trigger_key: { type: DataTypes.STRING(60), allowNull: false },
    trigger_config: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    id_power_reward: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    id_achievement_reward: { type: DataTypes.INTEGER, allowNull: true },
    id_title_reward: { type: DataTypes.INTEGER, allowNull: true },
    visibility_before_claim: {
      type: DataTypes.ENUM("HIDDEN", "TEASER"),
      allowNull: false,
      defaultValue: "HIDDEN",
    },
    reveal_after_claim: {
      type: DataTypes.ENUM("FULL", "FLAVOR_ONLY", "REMAIN_SECRET"),
      allowNull: false,
      defaultValue: "FULL",
    },
    announce_global: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "unique_feats" },
);

module.exports = UniqueFeat;
