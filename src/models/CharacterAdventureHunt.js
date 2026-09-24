const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Caçadas §13.2 — uma oferta (ou a Caçada em si, depois de aceita) por
// janela de 4h por personagem. UNIQUE(id_personagem, rotation_start)
// garante que refresh/logout/restart nunca gera outra oferta na MESMA
// janela; um índice único PARCIAL (WHERE status='Active', ver
// migration) garante no máximo uma Caçada Ativa por personagem — não
// modelável só com os campos do Sequelize, por isso vive na migration
// raw SQL.
//
// Todos os campos *_snapshot existem pra proteger ofertas antigas
// contra mudança futura de huntConfig.js (§13.2 "Snapshots protegem
// ofertas antigas contra mudanças futuras de configuração") — nunca
// reler HUNT_DIFFICULTIES/etc depois da oferta já criada.
const CharacterAdventureHunt = sequelize.define(
  "CharacterAdventureHunt",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_monstro: { type: DataTypes.INTEGER, allowNull: false },
    id_zona_referencia: { type: DataTypes.INTEGER, allowNull: true },
    rotation_start: { type: DataTypes.DATE, allowNull: false },
    rotation_end: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM("Offered", "Active", "Completed", "Abandoned", "Expired"),
      allowNull: false,
      defaultValue: "Offered",
    },
    difficulty: {
      type: DataTypes.ENUM("Dangerous", "Difficult", "Deadly", "Nightmare", "Extermination"),
      allowNull: false,
    },
    quantity_required: { type: DataTypes.INTEGER, allowNull: false },
    progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    title_snapshot: { type: DataTypes.STRING(150), allowNull: false },
    story_template_key: { type: DataTypes.STRING(50), allowNull: false },
    story_snapshot: { type: DataTypes.TEXT, allowNull: false },
    hp_multiplier_snapshot: { type: DataTypes.FLOAT, allowNull: false },
    damage_multiplier_snapshot: { type: DataTypes.FLOAT, allowNull: false },
    reward_multiplier_snapshot: { type: DataTypes.FLOAT, allowNull: false },
    gold_reward_snapshot: { type: DataTypes.INTEGER, allowNull: false },
    reputation_reward_snapshot: { type: DataTypes.INTEGER, allowNull: false },
    recommended_power_snapshot: { type: DataTypes.INTEGER, allowNull: true },
    random_factor_snapshot: { type: DataTypes.FLOAT, allowNull: false },
    accepted_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    abandoned_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "character_adventure_hunts",
  },
);

module.exports = CharacterAdventureHunt;
