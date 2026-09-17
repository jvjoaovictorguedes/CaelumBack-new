const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Progressão da guilda em tabela (não em fórmula fixa no código), como
// pedido no documento de design — dá pra rebalancear sem migration nova,
// só um UPDATE nessa tabela.
const GuildLevelConfig = sequelize.define(
  "GuildLevelConfig",
  {
    nivel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
    },
    xp_para_proximo_nivel: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    limite_membros: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    tableName: "GuildLevelConfig",
    timestamps: false,
  },
);

module.exports = GuildLevelConfig;
