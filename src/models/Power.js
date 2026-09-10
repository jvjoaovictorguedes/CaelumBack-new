const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Power = sequelize.define("Power", {
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
  tipo_poder: {
    type: DataTypes.ENUM("Ativo", "Passivo"),
    allowNull: false,
  },
  custo_mana: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  dano_base: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  cura_base: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  efeito_status: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  duracao_efeito: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  cooldown: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  escala_atributo: {
    type: DataTypes.ENUM(
      "Forca",
      "Vitalidade",
      "Agilidade",
      "Inteligencia",
      "Velocidade"
    ),
    allowNull: false,
  },
  valor_escala: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
    allowNull: false,
  },
});

module.exports = Power;
