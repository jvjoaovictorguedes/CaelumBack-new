const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ingrediente real do inventário (Item.id) — nunca guarda id_monstro/
// id_recurso/qualidade separada (spec §6.2/§7): a qualidade já está
// embutida no Item específico obtido pela Expedição.
const AlchemyRecipeIngredient = sequelize.define(
  "AlchemyRecipeIngredient",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_recipe: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  },
  { tableName: "alchemy_recipe_ingredients", timestamps: false },
);

module.exports = AlchemyRecipeIngredient;
