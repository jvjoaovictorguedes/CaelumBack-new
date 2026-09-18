const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Liga recurso+qualidade a um Item por ID — nunca procurar por nome
// ("Fragmento de Ferro — Raro") no meio de uma coleta.
const ExpeditionResourceItem = sequelize.define(
  "ExpeditionResourceItem",
  {
    id_recurso: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
    qualidade: {
      type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
      allowNull: false,
      primaryKey: true,
    },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "expedition_resource_items" },
);

module.exports = ExpeditionResourceItem;
