const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("./Item");

const ArmorProperties = sequelize.define("ArmorProperties", {
  id_item: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: Item,
      key: "id",
    },
    allowNull: false,
  },
  slot_equipamento: {
    type: DataTypes.ENUM("Cabeca", "Torso", "Maos", "Pes"),
    allowNull: false,
  },
  defesa: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_forca: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_vitalidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_inteligencia: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_agilidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_velocidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
});

module.exports = ArmorProperties;
