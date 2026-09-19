const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Temporada da Arena Ranqueada (PvP Competitivo v1, §7). Não confundir
// com o Ranking PvP v2 (rankingService.js) — aquele usa PvpStatus e
// continua existindo à parte, sem relação com rating/temporada.
const PvPSeason = sequelize.define(
  "PvPSeason",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    ends_at: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM("Agendada", "Ativa", "Encerrada"),
      allowNull: false,
      defaultValue: "Agendada",
    },
  },
  { tableName: "pvp_seasons" },
);

module.exports = PvPSeason;
