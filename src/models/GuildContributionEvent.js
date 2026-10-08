const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Contribuição V2 §15 — ledger IMUTÁVEL (sem updatedAt) que sustenta
// ranking semanal/mensal/histórico por AGREGAÇÃO (SUM filtrado por
// período), sem reset físico de contador nenhum — §16 da spec: "o
// ranking recente é calculado filtrando GuildContributionEvent pelo
// início do ciclo atual". Único service autorizado a inserir aqui é
// guildContributionService.pontuarContribuicao (nunca outro sistema
// direto — §15 in fine).
const GuildContributionEvent = sequelize.define(
  "GuildContributionEvent",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
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
    source_type: {
      type: DataTypes.ENUM(
        "MISSION_DAILY",
        "MISSION_WEEKLY",
        "MISSION_MONTHLY",
        "MISSION_RANK",
        "GUILD_BOSS",
        "GOLD_DONATION",
      ),
      allowNull: false,
    },
    source_id: { type: DataTypes.INTEGER, allowNull: true },
    pontos: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  { tableName: "GuildContributionEvents", updatedAt: false },
);

module.exports = GuildContributionEvent;
