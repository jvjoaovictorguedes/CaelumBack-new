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
    // Nomes iguais aos das constraints criadas em
    // 20261026340000-perfil-jogador-schema.js — sem isso, o Sequelize
    // gera um nome default diferente pro índice, não reconhece a
    // constraint já existente no banco e tenta recriá-la a cada
    // `sequelize.sync()` (fora de produção, no boot), falhando com
    // "already exists" e entrando num loop de retry.
    indexes: [
      { unique: true, fields: ["id_personagem", "slot"], name: "perfil_achv_highlight_personagem_slot_unique" },
      { unique: true, fields: ["id_personagem", "id_achievement"], name: "perfil_achv_highlight_personagem_achievement_unique" },
    ],
  },
);

module.exports = CharacterProfileAchievementHighlight;
