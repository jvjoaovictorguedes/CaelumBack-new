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
    // Fila: "notificação até o player abrir" — marca quando esse membro
    // viu o Mural pela última vez. null = nunca abriu (qualquer post
    // existente conta como não lido). Atualizado em guildMuralController
    // (listar), comparado em guildController (buscarGuildPorId).
    mural_ultima_leitura_em: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "GuildMembers",
    timestamps: false,
  },
);

module.exports = GuildMember;
