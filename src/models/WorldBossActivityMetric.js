const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Telemetria agregada de encontros elegíveis (§5.1/§5.2), truncada pra
// hora — nunca por encontro individual. Mantém o schema "pronto pra
// dinâmico" mesmo usando o fallback simples de threshold por enquanto.
const WorldBossActivityMetric = sequelize.define(
  "WorldBossActivityMetric",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    window_start: { type: DataTypes.DATE, allowNull: false, unique: true },
    encontros_elegiveis: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  },
  { tableName: "world_boss_activity_metrics", createdAt: false, updatedAt: false },
);

module.exports = WorldBossActivityMetric;
