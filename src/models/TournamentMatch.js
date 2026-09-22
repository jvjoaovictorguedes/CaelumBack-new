const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Um JOGO dentro de uma série (§16). O combate em si é um duelo ao vivo
// normal (pvpLiveSocket.js) entre dois humanos online — `duel_id` guarda
// a sessão de duelo usada, pra dar rastreabilidade entre a série e o
// duelo que a resolveu.
const TournamentMatch = sequelize.define(
  "TournamentMatch",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    series_id: { type: DataTypes.INTEGER, allowNull: false },
    game_number: { type: DataTypes.INTEGER, allowNull: false },
    duel_id: { type: DataTypes.INTEGER, allowNull: true },
    winner_participant_id: { type: DataTypes.INTEGER, allowNull: true },
    motivo_encerramento: {
      type: DataTypes.ENUM("Combate", "Desistencia", "WO", "FalhaServidor"),
      allowNull: true,
    },
    iniciado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    encerrado_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "tournament_matches" },
);

module.exports = TournamentMatch;
