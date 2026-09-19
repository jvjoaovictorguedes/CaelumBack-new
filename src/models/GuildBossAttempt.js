const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Tentativa semanal do Boss da Guilda — substitui GuildGateAttempt.
// vida_total/custo/pools são CÓPIAS do GuildBossConfig no momento em
// que a tentativa foi liberada (não mudam se alguém editar o boss
// depois, no meio da semana). `semana_inicio` é a chave do ciclo global
// semanal (guildConfig.inicioDoCicloSemanal) — a unique index
// (id_guild, semana_inicio) é o que garante "1 boss por semana" mesmo
// que a tentativa já tenha sido derrotada/expirada (§31: "Se a Guilda
// falhar em derrotar o Boss, não pode comprar outro naquela semana").
const GuildBossAttempt = sequelize.define(
  "GuildBossAttempt",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild: { type: DataTypes.INTEGER, allowNull: false },
    id_guild_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    rank: { type: DataTypes.STRING(10), allowNull: false },
    vida_total: { type: DataTypes.BIGINT, allowNull: false },
    vida_restante: { type: DataTypes.BIGINT, allowNull: false },
    semana_inicio: { type: DataTypes.DATE, allowNull: false },
    expira_em: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM("Ativo", "Vencido", "Expirado"), allowNull: false, defaultValue: "Ativo" },
    // §36 — só true depois que a distribuição final de Gold/XP/contador
    // histórico realmente aconteceu (idempotência, §57/§58).
    recompensa_distribuida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: "guild_boss_attempts",
    indexes: [{ unique: true, fields: ["id_guild", "semana_inicio"] }],
  },
);

module.exports = GuildBossAttempt;
