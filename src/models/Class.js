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
  multiplicador_dano_fisico: {
    type: DataTypes.FLOAT,
    defaultValue: 1.0,
    allowNull: false,
  },
  multiplicador_dano_magico: {
    type: DataTypes.FLOAT,
    defaultValue: 1.0,
    allowNull: false,
  },
  imagem_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Classe rara (Primordial/Celestial) — mesma ideia do campo `raro` de
  // Race: só liberada por um sorteio feito e verificado no servidor,
  // nunca por o cliente simplesmente mandar o id dela.
  raro: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Classes V2 §3 — identidade/gameplay editável no Painel Admin, sem
  // virar uma tabela monolítica: nome/multiplicadores continuam sendo o
  // núcleo, os campos abaixo são metadados de apresentação/filtro.
  slug: {
    type: DataTypes.STRING(60),
    allowNull: true,
    unique: true,
  },
  icone_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  banner_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  // Permite esconder uma classe da criação de personagem sem apagá-la
  // (personagens já existentes continuam funcionando normalmente).
  disponivel_criacao: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  papel: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  atributo_principal: {
    type: DataTypes.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
    allowNull: true,
  },
  atributo_secundario: {
    type: DataTypes.ENUM("Forca", "Vitalidade", "Agilidade", "Inteligencia", "Velocidade"),
    allowNull: true,
  },
  ordem_exibicao: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
});

module.exports = Class;
