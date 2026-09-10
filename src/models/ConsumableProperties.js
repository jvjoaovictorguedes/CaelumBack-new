const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("./Item");

const ConsumableProperties = sequelize.define(
  "ConsumableProperties",
  {
    id_item: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      references: {
        model: Item,
        key: "id",
      },
      allowNull: false,
    },
    efeito_vida: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    efeito_mana: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    efeito_atributo: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    valor_atributo: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    duracao_efeito: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "consumable_properties",
    timestamps: false,
  }
);

module.exports = ConsumableProperties;
