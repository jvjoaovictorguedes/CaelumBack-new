const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ForgeBlueprintResult = sequelize.define(
  "ForgeBlueprintResult",
  {
    id_blueprint: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    qualidade: {
      type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
      allowNull: false,
      primaryKey: true,
    },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "forge_blueprint_results", timestamps: false },
);

module.exports = ForgeBlueprintResult;
