const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Uma das 5 ofertas de um Rank numa janela de rotação de 6h (§13/§16/
// §40/§41) — GLOBAL (não por personagem): todo mundo no mesmo Rank vê
// exatamente as mesmas 5 ofertas até a próxima janela, mesmo depois de
// refresh/logout/restart (§40), porque `janela_inicio` é uma chave
// determinística calculada a partir do relógio do SERVIDOR
// (adventureGuildConfig.inicioDaJanelaAtual), nunca sorteada de novo a
// cada request.
const AdventureGuildOffer = sequelize.define(
  "AdventureGuildOffer",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    rank: { type: DataTypes.STRING(10), allowNull: false },
    janela_inicio: { type: DataTypes.DATE, allowNull: false },
    id_mission: { type: DataTypes.INTEGER, allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: "adventure_guild_offers",
    indexes: [
      { unique: true, fields: ["rank", "janela_inicio", "ordem"], name: "adventure_guild_offers_rank_janela_ordem_unique" },
      { unique: true, fields: ["rank", "janela_inicio", "id_mission"], name: "adventure_guild_offers_rank_janela_missao_unique" },
    ],
  },
);

module.exports = AdventureGuildOffer;
