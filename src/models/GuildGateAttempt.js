const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Instância ATIVA (ou já concluída) de um Portal de Guilda — só uma
// "ativo" por guilda de cada vez (garantido no controller, não aqui).
// vida_total é uma CÓPIA do GuildRankGate no momento em que a tentativa
// começou (não muda se alguém editar o chefe depois, no meio da janela).
const GuildGateAttempt = sequelize.define(
  "GuildGateAttempt",
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
    },
    id_guild_rank_gate: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    rank: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    vida_total: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    vida_restante: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    expira_em: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("Ativo", "Vencido", "Expirado"),
      allowNull: false,
      defaultValue: "Ativo",
    },
  },
  {
    tableName: "guild_gate_attempts",
  },
);

module.exports = GuildGateAttempt;
