const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Race = sequelize.define("Race", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  nome_masculino: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  nome_feminino: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  descricao_masculina: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  descricao_feminina: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  bonus_forca: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_vitalidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_agilidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_inteligencia: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  bonus_velocidade: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  imagem_masculina_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  imagem_feminina_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
});

module.exports = Race;
