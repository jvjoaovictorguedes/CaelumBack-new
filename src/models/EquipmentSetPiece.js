const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Vínculo Item <-> EquipmentSet (Especificação Sistema de Conjuntos
// §4.2). `piece_key` é a identidade lógica deduplicável usada pela
// contagem de peças equipadas (equipmentSetService) — nunca o
// id_item/instância diretamente, pra dois slots com o mesmo item lógico
// (ex.: acessório duplicado) não contarem em dobro.
const EquipmentSetPiece = sequelize.define(
  "EquipmentSetPiece",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    equipment_set_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    piece_key: { type: DataTypes.STRING(100), allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "equipment_set_pieces" },
);

module.exports = EquipmentSetPiece;
