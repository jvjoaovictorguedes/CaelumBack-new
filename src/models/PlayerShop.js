const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Perfil comercial do personagem (Loja do Aventureiro V2 §4.1) — uma
// loja por personagem (id_personagem unique). Nunca guarda produto,
// demanda ou encomenda aqui: isso vive em MarketListing/
// PlayerShopDemand/PlayerShopCommission, cada um buscado sob demanda a
// partir de id_personagem.
const PlayerShop = sequelize.define(
  "PlayerShop",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    aceita_encomendas: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "player_shops" },
);

module.exports = PlayerShop;
