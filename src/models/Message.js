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
    // Idempotência de envio (spec Mensagens v2 §6) — gerado pelo
    // cliente, único por remetente. Mensagens antigas/via REST sem esse
    // campo ficam null (índice único é parcial, ver migration).
    client_message_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: "messages",
  },
);

module.exports = Message;
