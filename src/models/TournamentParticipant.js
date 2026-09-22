const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Inscrição de um personagem num torneio (§16). `seed` é a posição
// sorteada no chaveamento (0-based), gravada no start junto com o
// bracket_seed do torneio. `final_placement` só é preenchido quando a
// colocação está decidida (1, 2 ou 3) — pódio e troféus são derivados
// daqui, nunca de contador enviado pelo cliente.
const TournamentParticipant = sequelize.define(
  "TournamentParticipant",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    tournament_id: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    seed: { type: DataTypes.INTEGER, allowNull: true },
    eliminated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    final_placement: { type: DataTypes.INTEGER, allowNull: true },
    // §16 — loadout congelado enquanto a série está em andamento.
    loadout_travado: { type: DataTypes.JSONB, allowNull: true },
  },
  { tableName: "tournament_participants" },
);

module.exports = TournamentParticipant;
