const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Power = require("./Power");

const CharacterAbilities = sequelize.define("CharacterAbilities", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  id_personagem: {
    type: DataTypes.INTEGER,
    references: {
      model: Character,
      key: "id",
    },
    allowNull: false,
  },
  id_power: {
    type: DataTypes.INTEGER,
    references: {
      model: Power,
      key: "id",
    },
    allowNull: false,
  },
  level_learned: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  // Nível da HABILIDADE em si (1 a 10, ver abilityLevelService.js) — não
  // confundir com level_learned (nível do PERSONAGEM quando ela foi
  // liberada). Evolui gastando ouro + Fragmento de Grimório, deixando o
  // mesmo poder mais forte pro personagem que investir nele.
  nivel_habilidade: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["id_personagem", "id_power"],
      name: "character_abilities_personagem_power_unique",
    },
  ],
});

module.exports = CharacterAbilities;
