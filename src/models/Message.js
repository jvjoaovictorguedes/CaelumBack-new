const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const User = require("./User");

const Message = sequelize.define(
  "Message",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_remetente: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    id_destinatario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: User, key: "id" },
    },
    conteudo: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lida: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  },
  {
    tableName: "messages",
  },
);

module.exports = Message;
