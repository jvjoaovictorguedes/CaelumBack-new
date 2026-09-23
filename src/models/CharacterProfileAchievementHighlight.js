const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Achievement = require("./Achievement");

// Até 3 conquistas em destaque no Perfil (§24). Unique por
// personagem+slot (uma por posição) E por personagem+achievement (a
// mesma conquista não repete em dois slots).
const CharacterProfileAchievementHighlight = sequelize.define(
  "CharacterProfileAchievementHighlight",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Character, key: "id" },
    },
    slot: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 3 } },
    id_achievement: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Achievement, key: "id" },
    },
  },
  {
    tableName: "character_profile_achievement_highlights",
    indexes: [
      { unique: true, fields: ["id_personagem", "slot"] },
      { unique: true, fields: ["id_personagem", "id_achievement"] },
    ],
  },
);

module.exports = CharacterProfileAchievementHighlight;
