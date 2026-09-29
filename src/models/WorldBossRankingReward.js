const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ameaça Mundial V2 §11.3 — faixas de recompensa por colocação no
// ranking final. Primeira entrega do Admin pode cadastrar só "1º lugar"
// (posicao_inicio=posicao_fim=1); o schema já aceita faixas futuras
// (2-3, 4-10 etc.) sem migration nova.
const WorldBossRankingReward = sequelize.define(
  "WorldBossRankingReward",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    posicao_inicio: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    posicao_fim: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
    id_item: { type: DataTypes.INTEGER, allowNull: true },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    gold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "world_boss_ranking_rewards" },
);

module.exports = WorldBossRankingReward;
