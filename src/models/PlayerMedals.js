const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("./Character");

const PlayerMedals = sequelize.define("PlayerMedals", {
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
  ultima_conquista: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
});

module.exports = PlayerMedals;
