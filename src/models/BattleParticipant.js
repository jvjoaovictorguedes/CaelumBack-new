const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const BattleParticipant = sequelize.define(
  "BattleParticipant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    battle_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    character_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    enemy_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    unit_type: {
      type: DataTypes.ENUM("player", "enemy"),
      allowNull: false,
    },

    team: {
      type: DataTypes.ENUM("allies", "enemies"),
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    hp: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    max_hp: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    mana: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    max_mana: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    x: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },

    y: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },

    alive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    tableName: "battle_participants",
    timestamps: true,
  },
);

module.exports = BattleParticipant;
