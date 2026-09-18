const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CraftingRecipeIngredient = sequelize.define(
  "CraftingRecipeIngredient",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_receita: { type: DataTypes.INTEGER, allowNull: false },
    id_item_material: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "crafting_recipe_ingredients" },
);

module.exports = CraftingRecipeIngredient;
