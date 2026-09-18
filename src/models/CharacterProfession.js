const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CharacterProfession = sequelize.define(
  "CharacterProfession",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.ENUM("Mineracao", "Silvicultura", "Exploracao"), allowNull: false },
    nivel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    experiencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    proxima_coleta_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "character_professions" },
);

module.exports = CharacterProfession;
