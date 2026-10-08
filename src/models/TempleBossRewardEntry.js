const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — loot exclusivo do primeiro clear do
// Guardião (§10.2/§10.3), com reward band opcional por nível.
const TempleBossRewardEntry = sequelize.define(
  "TempleBossRewardEntry",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_boss_config: { type: DataTypes.INTEGER, allowNull: false },
    reward_kind: { type: DataTypes.ENUM("STACKABLE_ITEM", "EQUIPMENT"), allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    raridade_instancia: { type: DataTypes.STRING(20), allowNull: true },
    weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    nivel_minimo: { type: DataTypes.INTEGER, allowNull: true },
    nivel_maximo: { type: DataTypes.INTEGER, allowNull: true },
    nome_exibicao: { type: DataTypes.STRING(150), allowNull: false },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "temple_boss_reward_entries" },
);

module.exports = TempleBossRewardEntry;
