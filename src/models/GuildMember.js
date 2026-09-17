const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// id_personagem é a PK (não um id auto-incremento à parte) de propósito:
// isso já garante "um personagem só pertence a uma guilda por vez" no
// nível do banco, sem precisar de uma constraint separada.
const GuildMember = sequelize.define(
  "GuildMember",
  {
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: { model: "Characters", key: "id" },
    },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    cargo: {
      type: DataTypes.ENUM(
        "Fundador",
        "Oficial",
        "Veterano",
        "Membro",
        "Recruta",
      ),
      allowNull: false,
      defaultValue: "Recruta",
    },
    data_entrada: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "GuildMembers",
    timestamps: false,
  },
);

module.exports = GuildMember;
