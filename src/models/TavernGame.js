const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sistema de Taverna §7.3/§9 — catálogo dos jogos 50/50. presentation_key
// é só apresentação visual; todo jogo roda no MESMO motor
// (tavernGameService), nunca um motor de RNG por jogo.
const TavernGame = sequelize.define(
  "TavernGame",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    presentation_key: {
      type: DataTypes.ENUM("COIN", "RUNES", "DICE_PARITY", "CARD_SIDE"),
      allowNull: false,
    },
    win_chance_ppm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 500000 },
    payout_multiplier: { type: DataTypes.FLOAT, allowNull: false },
    min_bet: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    max_bet: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "tavern_games" },
);

module.exports = TavernGame;
