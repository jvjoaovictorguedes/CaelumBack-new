const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const GuildInvite = sequelize.define(
  "GuildInvite",
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
    id_personagem_convidado: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    id_personagem_convidante: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    status: {
      type: DataTypes.ENUM(
        "Pendente",
        "Aceito",
        "Recusado",
        "Cancelado",
        "Expirado",
      ),
      allowNull: false,
      defaultValue: "Pendente",
    },
    data_expiracao: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "GuildInvites",
  },
);

module.exports = GuildInvite;
