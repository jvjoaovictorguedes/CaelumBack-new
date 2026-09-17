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
  // Raça rara (ex.: Celestial) — só pode ser escolhida na criação de
  // personagem depois de um sorteio feito e verificado no SERVIDOR
  // (ver raridadeRolagemService.js). Antes disso, o cliente decidia
  // sozinho (Math.random no frontend) se "ganhou" a raça e simplesmente
  // mandava o id dela em POST /characters — nada no backend impedia
  // qualquer um de escolher a raça rara direto, sem sortear nada.
  raro: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
});

module.exports = Race;
