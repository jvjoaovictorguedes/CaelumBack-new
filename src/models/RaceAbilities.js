const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const Race = require("./Race");
const Power = require("./Power");

const RaceAbilities = sequelize.define("RaceAbilities", {
  id_race: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: Race,
      key: "id",
    },
    allowNull: false,
  },
  id_power: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    references: {
      model: Power,
      key: "id",
    },
    allowNull: false,
  },
  nivel_aprendizado: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
});

module.exports = RaceAbilities;
