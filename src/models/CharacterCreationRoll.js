const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const User = require("./User");

// Um sorteio de raça e um sorteio de classe por CONTA, pra sempre — ver
// migration 20260918030000-create-character-creation-rolls.js. Uma vez
// que race_roll_done/class_roll_done vira true, o resultado gravado
// aqui é definitivo: nenhum código deve rodar sortearRacaRaraGanhou()/
// sortearClasseRaraGanhou() de novo pra essa conta depois disso.
const CharacterCreationRoll = sequelize.define(
  "CharacterCreationRoll",
  {
    id_usuario: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    race_roll_done: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    race_rare_won: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    class_roll_done: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    class_rare_won: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    class_rare_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "character_creation_rolls",
  },
);

module.exports = CharacterCreationRoll;
