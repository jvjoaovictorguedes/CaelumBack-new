const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Trophies = sequelize.define("Trophies", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  raridade: {
    type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Épico", "Lendário"),
    allowNull: false,
  },
  tipo_recompensa: {
    type: DataTypes.ENUM("Experiência", "Item", "Moeda"),
    allowNull: false,
  },
  tipo_valor: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
});

module.exports = Trophies;
