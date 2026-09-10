const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Item = sequelize.define("Item", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  tipo_item: {
    type: DataTypes.ENUM(
      "Consumivel",
      "Armadura",
      "Capacete",
      "Escudo",
      "Arma",
      "Acessorio1",
      "Acessorio2",
      "Material",
      "QuestItem",
      "Currencia"
    ),
    allowNull: false,
  },
  raridade: {
    type: DataTypes.ENUM(
      "Comum",
      "Incomum",
      "Raro",
      "Epico",
      "Lendario",
      "Mitico"
    ),
    allowNull: false,
  },
  valor_compra: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  valor_venda: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  peso: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0.0,
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
});

module.exports = Item;
