const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico de partidas da Arena Ranqueada, com rating antes/depois dos
// dois jogadores (§16 — observabilidade, essencial pra investigar
// exploração). Nunca reaproveita PvpMatches (aquele é do Duelo casual).
const RankedMatch = sequelize.define(
  "RankedMatch",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    season_id: { type: DataTypes.INTEGER, allowNull: false },
    id_jogador1: { type: DataTypes.INTEGER, allowNull: false },
    id_jogador2: { type: DataTypes.INTEGER, allowNull: false },
    id_vencedor: { type: DataTypes.INTEGER, allowNull: true },
    rating_jogador1_antes: { type: DataTypes.INTEGER, allowNull: false },
    rating_jogador1_depois: { type: DataTypes.INTEGER, allowNull: true },
    rating_jogador2_antes: { type: DataTypes.INTEGER, allowNull: false },
    rating_jogador2_depois: { type: DataTypes.INTEGER, allowNull: true },
    // Vitoria: resultado oficial de duelo. Abandono: grace period de
    // reconexão (§9) expirou sem o jogador voltar. FalhaServidor: erro
    // interno comprovado encerrou a partida sem alterar rating (§9).
    motivo_encerramento: {
      type: DataTypes.ENUM("Vitoria", "Abandono", "FalhaServidor"),
      allowNull: true,
    },
    iniciada_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    encerrada_em: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "ranked_matches", timestamps: false },
);

module.exports = RankedMatch;
