const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Parâmetro operacional deliberadamente administrável (Painel
// Administrativo §18/§19) — só o que faz sentido um ADM balancear sem
// deploy (ex.: taxa/limites do Mercado). Nunca vira um lugar pra mover
// TODAS as constantes do jogo pra banco.
const GameSetting = sequelize.define(
  "GameSetting",
  {
    chave: { type: DataTypes.STRING(80), primaryKey: true, allowNull: false },
    valor: { type: DataTypes.JSONB, allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    tipo: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "json" },
    editavel_admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    updated_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "game_settings" },
);

module.exports = GameSetting;
