const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// contribuicao_total deixou de ser "quase só Gold doado" (spec
// "Aprimoramento do Sistema de Guildas" §43/§44) — agora é uma métrica
// de PONTOS somando Missões da Guilda + Boss + Doação normalizada (ver
// guildContributionService.pontuarContribuicao), nunca mais Gold cru
// somado direto. Doação não gera mais XP de Guilda (§15) — por isso os
// campos antigos xp_doacao_hoje/data_ultimo_xp_doacao (teto diário de
// XP por doação) foram removidos.
const GuildContribution = sequelize.define(
  "GuildContribution",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Characters", key: "id" },
    },
    ouro_doado_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    contribuicao_total: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    contribuicao_temporada: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "GuildContributions",
    indexes: [{ unique: true, fields: ["id_guild", "id_personagem"] }],
  },
);

module.exports = GuildContribution;
