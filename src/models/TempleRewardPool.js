const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — catálogo editável do Relicário dos Ecos
// (§6/§11.1). Linha editável: só templeLifecycleService.montarSnapshot
// lê isto pra congelar em TempleEvent.config_snapshot.relicary; o draw
// em runtime (templeRelicaryService) nunca consulta esta tabela
// diretamente, sempre o snapshot congelado.
const TempleRewardPool = sequelize.define(
  "TempleRewardPool",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    nome: { type: DataTypes.STRING(150), allowNull: false },
    custo_sigilos_draw: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    pity_raro_mais_garantia: { type: DataTypes.INTEGER, allowNull: true },
    pity_featured_garantia: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "temple_reward_pools" },
);

module.exports = TempleRewardPool;
