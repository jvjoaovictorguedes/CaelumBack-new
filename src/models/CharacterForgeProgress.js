const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CharacterForgeProgress = sequelize.define(
  "CharacterForgeProgress",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    nivel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    experiencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "character_forge_progress" },
);

module.exports = CharacterForgeProgress;
