const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CharacterEvolution = sequelize.define(
  "CharacterEvolution",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_evolucao: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "character_evolutions",
    indexes: [
      {
        unique: true,
        fields: ["id_personagem", "id_evolucao"],
        name: "character_evolutions_personagem_evolucao_unique",
      },
    ],
  },
);

module.exports = CharacterEvolution;
