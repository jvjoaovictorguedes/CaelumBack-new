const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GuildApplication = sequelize.define(
  "GuildApplication",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    mensagem: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        "Pendente",
        "Aceita",
        "Recusada",
        "Cancelada",
        "Expirada",
      ),
      allowNull: false,
      defaultValue: "Pendente",
    },
    data_resposta: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "GuildApplications",
  },
);

module.exports = GuildApplication;
