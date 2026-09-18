const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Cópia individual de um equipamento fabricado/refinado na Forja v3 —
// duas instâncias do mesmo Item podem ter refinamento diferente (spec
// §26). Equipamento obtido fora da Forja v3 (drop/loja/mercado/Forja v2)
// continua vivendo em CharacterInventory como sempre, sem instância —
// ver comentário em 20260930300000-forge-v3-progress-and-instances.js.
const CharacterEquipmentInstance = sequelize.define(
  "CharacterEquipmentInstance",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    refinamento: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    equipada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: "character_equipment_instances" },
);

module.exports = CharacterEquipmentInstance;
