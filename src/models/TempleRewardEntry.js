const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — entrada do Relicário dos Ecos (§6.2/§7).
// key é estável dentro do pool (fallback_key referencia outra entry por
// este campo, nunca pelo id numérico).
const TempleRewardEntry = sequelize.define(
  "TempleRewardEntry",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_pool: { type: DataTypes.INTEGER, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false },
    reward_kind: { type: DataTypes.ENUM("STACKABLE_ITEM", "EQUIPMENT"), allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    raridade_instancia: { type: DataTypes.STRING(20), allowNull: true },
    weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    eh_raro_mais: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    eh_featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    eh_unico: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fallback_key: { type: DataTypes.STRING(80), allowNull: true },
    nome_exibicao: { type: DataTypes.STRING(150), allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "temple_reward_entries" },
);

module.exports = TempleRewardEntry;
