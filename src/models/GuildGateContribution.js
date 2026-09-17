const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Um "hit" por vez, não um duelo — cada linha soma o dano de UM ataque
// de UM personagem contra a tentativa ativa. ultimo_ataque é o cooldown
// (ver COOLDOWN_ATAQUE_MS em guildGateController.js) — sem isso, um
// personagem só conseguiria zerar o chefe sozinho batendo em loop.
const GuildGateContribution = sequelize.define(
  "GuildGateContribution",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    id_guild_gate_attempt: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    dano_total: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },
    ultimo_ataque: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "guild_gate_contributions",
    indexes: [
      {
        unique: true,
        fields: ["id_guild_gate_attempt", "id_personagem"],
        name: "guild_gate_contributions_tentativa_personagem_unique",
      },
    ],
  },
);

module.exports = GuildGateContribution;
