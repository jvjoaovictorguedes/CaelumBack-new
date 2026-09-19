const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const { RATING_INICIAL } = require("../config/rankedConfig");

// Participação de um personagem numa temporada da Arena Ranqueada
// (§7). Uma linha por (character_id, season_id) — histórico de
// temporadas passadas fica preservado, nunca sobrescrito.
const CharacterPvpSeason = sequelize.define(
  "CharacterPvpSeason",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    season_id: { type: DataTypes.INTEGER, allowNull: false },
    rating: { type: DataTypes.INTEGER, allowNull: false, defaultValue: RATING_INICIAL },
    jogos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    vitorias: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    derrotas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    peak_rating: { type: DataTypes.INTEGER, allowNull: false, defaultValue: RATING_INICIAL },
  },
  { tableName: "character_pvp_seasons" },
);

module.exports = CharacterPvpSeason;
