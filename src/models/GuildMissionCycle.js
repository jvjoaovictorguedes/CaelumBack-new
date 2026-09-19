const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Missão ATIVA de uma categoria pra uma guilda, no ciclo atual (spec
// §9/§10/§52: "a Guilda possui um quadro comum" — uma linha por
// (guilda, categoria, ciclo), nunca uma lista de ofertas pra escolher
// como na Guilda dos Aventureiros). `ciclo_inicio` é a chave da janela
// global (dia/semana/mês/rotação de 6h conforme a categoria) — vem
// sempre do relógio do servidor via guildConfig, nunca do cliente.
const GuildMissionCycle = sequelize.define(
  "GuildMissionCycle",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Guilds", key: "id" } },
    categoria: { type: DataTypes.ENUM("Diaria", "Semanal", "Mensal", "Rank"), allowNull: false },
    id_guild_mission: { type: DataTypes.INTEGER, allowNull: false, references: { model: "guild_missions", key: "id" } },
    ciclo_inicio: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "guild_mission_cycles",
    indexes: [{ unique: true, fields: ["id_guild", "categoria", "ciclo_inicio"] }],
  },
);

module.exports = GuildMissionCycle;
