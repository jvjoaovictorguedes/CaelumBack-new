const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Item = require("./Item");

const CharacterInventory = sequelize.define(
  "CharacterInventory",
  {
    id_personagem_inventario: {
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
    id_item: {
      type: DataTypes.INTEGER,
      references: {
        model: Item,
        key: "id",
      },
      allowNull: false,
    },
    quantidade: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
    },
    equipado: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "character_inventory",
    timestamps: false,
  }
);

module.exports = CharacterInventory;
