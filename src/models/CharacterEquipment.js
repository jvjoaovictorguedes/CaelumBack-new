const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");
const Item = require("./Item");

const CharacterEquipment = sequelize.define(
  "CharacterEquipment",
  {
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: Character,
        key: "id",
      },
    },
    slot: {
      type: DataTypes.ENUM(
        "Cabeca",
        "Torso",
        "Maos",
        "Pes",
        "ArmaPrincipal",
        "ArmaSecundaria",
        "Acessorio1",
        "Acessorio2",
      ),
      allowNull: false,
      primaryKey: true,
    },
    id_item: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Item,
        key: "id",
      },
    },
  },
  {
    tableName: "character_equipment",
    timestamps: false,
  },
);

module.exports = CharacterEquipment;
