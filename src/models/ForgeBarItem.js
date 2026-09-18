const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Vincula recurso de Mineração + qualidade -> Item "Barra" (mesmo padrão
// de ExpeditionResourceItem) — nunca resolver a barra por nome.
const ForgeBarItem = sequelize.define(
  "ForgeBarItem",
  {
    id_recurso: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    qualidade: {
      type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
      allowNull: false,
      primaryKey: true,
    },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "forge_bar_items", timestamps: false },
);

module.exports = ForgeBarItem;
