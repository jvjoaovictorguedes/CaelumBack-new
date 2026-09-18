const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ForgeScrollIngredient = sequelize.define(
  "ForgeScrollIngredient",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_scroll_item: { type: DataTypes.INTEGER, allowNull: false },
    id_item_material: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "forge_scroll_ingredients", timestamps: false },
);

module.exports = ForgeScrollIngredient;
