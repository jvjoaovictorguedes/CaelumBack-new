const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// §18/§53 — três árvores independentes (XP/GOLD/FORJA), nível 0..5 (0 =
// nunca comprado, linha só existe a partir do nível 1 — ver
// guildBuffService.obterNiveisAtuais que devolve 0 quando não há linha).
const GuildBuff = sequelize.define(
  "GuildBuff",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild: { type: DataTypes.INTEGER, allowNull: false, references: { model: "Guilds", key: "id" } },
    tipo: { type: DataTypes.ENUM("XP", "GOLD", "FORJA"), allowNull: false },
    nivel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  {
    tableName: "guild_buffs",
    indexes: [{ unique: true, fields: ["id_guild", "tipo"] }],
  },
);

module.exports = GuildBuff;
