const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Class = sequelize.define("Class", {
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
  multiplicador_vida_por_nivel: {
    type: DataTypes.FLOAT,
    defaultValue: 1.0,
    allowNull: false,
  },
  multiplicador_mana_por_nivel: {
    type: DataTypes.FLOAT,
    defaultValue: 1.0,
    allowNull: false,
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
});

module.exports = Class;
