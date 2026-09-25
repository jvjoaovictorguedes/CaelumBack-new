const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Sistema de Taverna §7.4/§8.2 — histórico IMUTÁVEL de apostas.
// request_id garante idempotência por personagem: retry/duplo clique
// com o mesmo request_id nunca gera um segundo roll (ver
// tavernGameService.js).
const TavernGameBet = sequelize.define(
  "TavernGameBet",
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    request_id: { type: DataTypes.STRING(64), allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_game: { type: DataTypes.INTEGER, allowNull: false },
    bet_amount: { type: DataTypes.INTEGER, allowNull: false },
    choice_key: { type: DataTypes.STRING(20), allowNull: false },
    outcome: { type: DataTypes.ENUM("Win", "Lose"), allowNull: false },
    payout_amount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    net_change: { type: DataTypes.INTEGER, allowNull: false },
    roll_ppm: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "tavern_game_bets", updatedAt: false },
);

module.exports = TavernGameBet;
