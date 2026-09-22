const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Limite diário de partidas ranqueadas (PvP v2 §11). Uma linha por
// (character_id, date_key), com UNIQUE no banco — é ela que torna o
// incremento atômico possível (INSERT ... ON CONFLICT + UPDATE
// condicional), em vez de um read-modify-write que duas requisições
// simultâneas conseguiriam furar.
//
// date_key é uma STRING "YYYY-MM-DD" já no fuso configurado
// (rankedConfig.RANKED_TIMEZONE_DIARIA), nunca um DATE do banco: assim
// a virada do dia é a mesma pra todo mundo, independente do fuso do
// servidor de banco.
const CharacterRankedDailyUsage = sequelize.define(
  "CharacterRankedDailyUsage",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    date_key: { type: DataTypes.STRING(10), allowNull: false },
    matches_used: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "character_ranked_daily_usage" },
);

module.exports = CharacterRankedDailyUsage;
