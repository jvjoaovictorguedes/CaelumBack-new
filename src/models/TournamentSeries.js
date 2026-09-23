const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Série (confronto) de um torneio (§16): MD3 em tudo, MD5 só na Final.
// `status` cobre o ciclo de ready check → jogo → resultado, incluindo
// W.O. e o caso de ausência DOS DOIS lados, que nunca escolhe vencedor
// sozinho e fica pendente de resolução de DEV/ADM.
const TournamentSeries = sequelize.define(
  "TournamentSeries",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    tournament_id: { type: DataTypes.INTEGER, allowNull: false },
    round: {
      type: DataTypes.ENUM("Oitavas", "Quartas", "Semifinal", "TerceiroLugar", "Final"),
      allowNull: false,
    },
    // Ordem dentro da rodada (0,1,2,3) — define quem encontra quem na
    // rodada seguinte, de forma determinística a partir do bracket.
    posicao: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    participant_a_id: { type: DataTypes.INTEGER, allowNull: true },
    participant_b_id: { type: DataTypes.INTEGER, allowNull: true },
    format: { type: DataTypes.ENUM("MD3", "MD5"), allowNull: false, defaultValue: "MD3" },
    score_a: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    score_b: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    winner_participant_id: { type: DataTypes.INTEGER, allowNull: true },
    status: {
      type: DataTypes.ENUM("Aguardando", "ReadyCheck", "EmAndamento", "Finalizada", "WO", "PendenteAdm"),
      allowNull: false,
      defaultValue: "Aguardando",
    },
    ready_check_expira_em: { type: DataTypes.DATE, allowNull: true },
    ready_a: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    ready_b: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: "tournament_series" },
);

module.exports = TournamentSeries;
