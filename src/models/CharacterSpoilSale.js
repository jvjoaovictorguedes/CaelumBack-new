const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Balcão de Espólios §4.6/§8.3 — cabeçalho de uma venda de espólios já
// confirmada. idempotency_key (único por personagem) impede que um
// duplo clique/retry do mesmo POST /spoils/sell pague duas vezes a
// mesma venda.
const CharacterSpoilSale = sequelize.define(
  "CharacterSpoilSale",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    total_ouro: { type: DataTypes.INTEGER, allowNull: false },
    idempotency_key: { type: DataTypes.STRING(100), allowNull: false },
  },
  {
    tableName: "character_spoil_sales",
  },
);

module.exports = CharacterSpoilSale;
