const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Trophies = require("./Trophies");
const Character = require("./Character");

const PlayerTrophies = sequelize.define("PlayerTrophies", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false,
  },
  personagem_id: {
    type: DataTypes.INTEGER,
    references: {
      model: Character,
      key: "id",
    },
    allowNull: false,
  },
  trofeu_id: {
    type: DataTypes.INTEGER,
    references: {
      model: Trophies,
      key: "id",
    },
    allowNull: false,
  },
  data_conquista: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
});

module.exports = PlayerTrophies;
