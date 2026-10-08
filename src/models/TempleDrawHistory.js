const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — um draw individual dentro de um lote 1x/10x
// (§6.1/§11.1). draw_seq é a sequência VITALÍCIA do personagem no
// Relicário (nunca reseta por evento), pra o histórico ficar ordenável
// mesmo cruzando Convergências.
const TempleDrawHistory = sequelize.define(
  "TempleDrawHistory",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_batch: { type: DataTypes.INTEGER, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    draw_seq: { type: DataTypes.INTEGER, allowNull: false },
    entry_key: { type: DataTypes.STRING(80), allowNull: false },
    reward_kind: { type: DataTypes.ENUM("STACKABLE_ITEM", "EQUIPMENT"), allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    nome_item_snapshot: { type: DataTypes.STRING(150), allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    raridade_snapshot: { type: DataTypes.STRING(20), allowNull: true },
    eh_fallback: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    original_entry_key: { type: DataTypes.STRING(80), allowNull: true },
    pity_raro_mais_antes: { type: DataTypes.INTEGER, allowNull: false },
    pity_raro_mais_depois: { type: DataTypes.INTEGER, allowNull: false },
    pity_featured_antes: { type: DataTypes.INTEGER, allowNull: false },
    pity_featured_depois: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "temple_draw_history" },
);

module.exports = TempleDrawHistory;
