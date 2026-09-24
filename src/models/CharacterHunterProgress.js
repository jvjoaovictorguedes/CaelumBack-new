const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Caçadas §7/§13.1 — Reputação de Caçador, PERMANENTE e independente
// do Rank F..S e da Reputação Comercial (Balcão de Espólios). Só
// persiste reputation_points; nível/título são sempre CALCULADOS
// (hunterReputationService), nunca uma segunda fonte de verdade — mesmo
// princípio de CharacterAdventureGuildProgress.reputacao_encomendas.
const CharacterHunterProgress = sequelize.define(
  "CharacterHunterProgress",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    reputation_points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hunts_completed_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hunts_completed_dangerous: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hunts_completed_difficult: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hunts_completed_deadly: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hunts_completed_nightmare: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    hunts_completed_extermination: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    monsters_killed_in_hunts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "character_hunter_progress",
  },
);

module.exports = CharacterHunterProgress;
