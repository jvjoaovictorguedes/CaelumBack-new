const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sistema de Taverna §7.1 — catálogo de Refeições/Bebidas. buff_key é
// validada em runtime contra tavernConfig.TAVERN_BUFF_KEYS (nunca uma
// fórmula/nome livre executável vinda do banco).
const TavernMenuItem = sequelize.define(
  "TavernMenuItem",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    categoria: { type: DataTypes.ENUM("Refeicao", "Bebida"), allowNull: false },
    preco_gold: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
    buff_key: { type: DataTypes.STRING(40), allowNull: false },
    magnitude: { type: DataTypes.FLOAT, allowNull: false },
    duracao_segundos: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    imagem_url: { type: DataTypes.STRING, allowNull: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "tavern_menu_items" },
);

module.exports = TavernMenuItem;
