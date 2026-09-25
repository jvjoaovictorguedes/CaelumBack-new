const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Espelha CharacterForgeProgress (spec §7/§8.3) — Nível de Pesca próprio
// (V1: 1..25), independente de Navegação (que não tem nível separado).
const CharacterFishingProgress = sequelize.define(
  "CharacterFishingProgress",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    nivel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    experiencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_capturado: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "character_fishing_progress" },
);

module.exports = CharacterFishingProgress;
