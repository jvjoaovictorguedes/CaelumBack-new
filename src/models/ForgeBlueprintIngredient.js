const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ForgeBlueprintIngredient = sequelize.define(
  "ForgeBlueprintIngredient",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_blueprint: { type: DataTypes.INTEGER, allowNull: false },
    tipo_insumo: { type: DataTypes.ENUM("Barra", "RecursoExpedicao"), allowNull: false },
    id_recurso: { type: DataTypes.INTEGER, allowNull: false },
    quantidade_base: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "forge_blueprint_ingredients", timestamps: false },
);

module.exports = ForgeBlueprintIngredient;
