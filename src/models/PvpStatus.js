const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");

const PvpStatus = sequelize.define("PvpStatus", {
  personagem_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Character,
      key: "id",
    },
    total_batalhas: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    vitorias: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    derrotas: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    sequencia_vitorias: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    maximo_sequencia_vitorias: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    sistema_classificacao: {
      type: DataTypes.ENUM("Elo", "Nivel", "Vitorias", "Trofeus", "Rank"),
      allowNull: false,
    },
    ultima_batalha_dia: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
});

module.exports = PvpStatus;
