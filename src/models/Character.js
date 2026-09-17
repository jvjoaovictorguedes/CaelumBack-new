const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const User = require("./User");
const Race = require("./Race");
const Class = require("./Class");

const Character = sequelize.define("Character", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  id_usuario: {
    type: DataTypes.INTEGER,
    references: {
      model: User,
      key: "id",
    },
    allowNull: false,
    // Cada conta tem no máximo um personagem — reforçado no banco (além
    // da checagem no controller) pra nenhuma corrida de dois creates
    // simultâneos conseguir criar um segundo personagem pra mesma conta.
    unique: true,
  },
  nome: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  genero: {
    type: DataTypes.ENUM("Masculino", "Feminino"),
    allowNull: false,
  },
  nivel: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  experiencia: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  vida_atual: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  mana_atual: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Marca o instante em que vida_atual foi uma verdade conhecida pela
  // última vez (dano, cura, level-up, ou a última vez que a
  // regeneração passiva foi calculada e aplicada). regenService usa
  // isso pra saber quanto tempo real se passou e quanto regenerar —
  // não tem job/cron rodando sozinho, o cálculo é sob demanda toda vez
  // que o personagem é lido ou entra em combate.
  ultima_atualizacao_vida: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  forca: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  vitalidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  agilidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  inteligencia: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  velocidade: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  dinheiro: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  pontos_distribuir: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
  },
  reset: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: true,
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
  rank: {
    type: DataTypes.STRING(50),
    defaultValue: "F",
    allowNull: true,
  },
  id_raca: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Race,
      key: "id",
    },
  },
  id_classe: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Class,
      key: "id",
    },
  },
});

module.exports = Character;
