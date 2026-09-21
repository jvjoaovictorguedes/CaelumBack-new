const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Battle = sequelize.define(
  "Battle",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    status: {
      type: DataTypes.ENUM("waiting", "active", "finished", "cancelled"),
      allowNull: false,
      defaultValue: "waiting",
    },

    turn_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    active_unit_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "battles",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = Battle;
