const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo Fase 15 — evento temporal server-wide (nunca
// por personagem/guilda, ver GuildBuff.js pro sistema permanente
// separado). Múltiplos buffs do mesmo tipo podem se sobrepor —
// globalBuffService soma os percentuais ativos, nunca escolhe um.
const GlobalBuff = sequelize.define(
  "GlobalBuff",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    tipo: {
      type: DataTypes.ENUM("Xp", "Ouro", "DropAventura", "XpExpedicao"),
      allowNull: false,
    },
    multiplicador_percentual: { type: DataTypes.INTEGER, allowNull: false },
    inicio: { type: DataTypes.DATE, allowNull: false },
    fim: { type: DataTypes.DATE, allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    id_admin_criador: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "global_buffs" },
);

module.exports = GlobalBuff;
