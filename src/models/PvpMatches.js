const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");

const PvpMatches = sequelize.define(
  "PvpMatches",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    tempo_inical_combate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    tempo_final_combate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    id_vencedor: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Character,
        key: "id",
      },
    },
    id_perdedor: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Character,
        key: "id",
      },
    },
    nome_arena: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    duracao_segundos: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    vencedor_pontos: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    perdedor_pontos: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "PvpMatches",
  },
);

module.exports = PvpMatches;
