const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Evolution = sequelize.define(
  "Evolution",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    id_classe: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    natureza_magica: {
      type: DataTypes.ENUM(
        "Fogo",
        "Agua",
        "Terra",
        "Ar",
        "Luz",
        "Escuridao",
        "Raio",
        "Yin&Yang",
      ),
      allowNull: false,
    },
    nivel_necessario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    custo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0 },
    },
    bonus_forca: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_vitalidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_agilidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_inteligencia: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    bonus_velocidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    id_power_concedido: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    id_evolucao_pre_requisito: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    ordem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    imagem_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "evolutions",
  },
);

module.exports = Evolution;
