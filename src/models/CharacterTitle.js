const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Title = require("./Title");

const CharacterTitle = sequelize.define(
  "CharacterTitle",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Character, key: "id" },
    },
    id_title: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Title, key: "id" },
    },
    desbloqueado_em: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "character_titles",
    indexes: [{ unique: true, fields: ["id_personagem", "id_title"] }],
  },
);

module.exports = CharacterTitle;
