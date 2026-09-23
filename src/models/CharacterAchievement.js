const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Achievement = require("./Achievement");

// Conquista desbloqueada por um personagem — unique (id_personagem,
// id_achievement) garante que achievementService.grantByKey seja
// idempotente mesmo chamado em paralelo (§51).
const CharacterAchievement = sequelize.define(
  "CharacterAchievement",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Character, key: "id" },
    },
    id_achievement: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Achievement, key: "id" },
    },
    desbloqueada_em: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "character_achievements",
    indexes: [{ unique: true, fields: ["id_personagem", "id_achievement"] }],
  },
);

module.exports = CharacterAchievement;
