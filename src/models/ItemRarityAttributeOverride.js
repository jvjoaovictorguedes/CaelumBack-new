const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ver migration 20261213010000 — override parcial dos atributos que
// equipmentRarityService aplica pra um Item numa Raridade específica,
// por cima da curva global RARITY_POWER_MULTIPLIER.
const ItemRarityAttributeOverride = sequelize.define(
  "ItemRarityAttributeOverride",
  {
    id_item: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    qualidade: {
      type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
      primaryKey: true,
      allowNull: false,
    },
    atributos: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  },
  { tableName: "item_rarity_attribute_overrides" },
);

module.exports = ItemRarityAttributeOverride;
