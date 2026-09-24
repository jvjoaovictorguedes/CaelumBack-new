const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Balcão de Espólios §4.6/§8.3 — uma linha de uma venda já confirmada.
// valor_unitario_snapshot/total_linha ficam CONGELADOS no momento da
// venda: uma mudança futura em Item.valor_venda nunca reescreve o
// histórico.
const CharacterSpoilSaleItem = sequelize.define(
  "CharacterSpoilSaleItem",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_sale: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    valor_unitario_snapshot: { type: DataTypes.INTEGER, allowNull: false },
    total_linha: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: "character_spoil_sale_items",
  },
);

module.exports = CharacterSpoilSaleItem;
