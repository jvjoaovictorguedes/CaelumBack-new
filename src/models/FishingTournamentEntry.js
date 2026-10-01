const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Inscrição de um personagem num Torneio da Pesca (ideia #1 da fila de
// melhorias) — 1 linha por (id_tournament, id_personagem). Só quem tem
// uma linha aqui entra na agregação de pontuação do torneio (ver
// fishingTournamentService.js); sem inscrição, captura durante a janela
// não conta mais (reversão deliberada do design original "automático",
// a pedido explícito do dono do produto).
const FishingTournamentEntry = sequelize.define(
  "FishingTournamentEntry",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_tournament: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    inscrito_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "fishing_tournament_entries" },
);

module.exports = FishingTournamentEntry;
