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
  id_character: {
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
});

module.exports = CharacterAbilities;
