const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Dano por membro numa tentativa de Boss — substitui
// GuildGateContribution. `ultimo_ataque` é o cooldown por membro (ver
// COOLDOWN_ATAQUE_MS em guildBossController.js), impedindo que uma
// pessoa sozinha derrube o boss batendo em loop.
const GuildBossContribution = sequelize.define(
  "GuildBossContribution",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild_boss_attempt: { type: DataTypes.INTEGER, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    dano_total: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    // V2.0 — quantos golpes (ataque básico ou poder) aquele membro
    // desferiu no boss, contado tanto no modo assíncrono (clique com
    // cooldown) quanto na batalha ao vivo — usado no ranking novo.
    numero_ataques: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ultimo_ataque: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "guild_boss_contributions",
    indexes: [
      {
        unique: true,
        fields: ["id_guild_boss_attempt", "id_personagem"],
        name: "guild_boss_contributions_tentativa_personagem_unique",
      },
    ],
  },
);

module.exports = GuildBossContribution;
