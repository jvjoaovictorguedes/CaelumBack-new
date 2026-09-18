const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const CraftingRecipe = sequelize.define(
  "CraftingRecipe",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    tempo_segundos: { type: DataTypes.INTEGER, allowNull: false },
    ouro_custo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "crafting_recipes" },
);

module.exports = CraftingRecipe;
