const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Vínculo Item <-> EquipmentSet (Especificação Sistema de Conjuntos
// §4.2). `piece_key` é a identidade lógica deduplicável usada pela
// contagem de peças equipadas (equipmentSetService) — nunca o
// id_item/instância diretamente, pra dois slots com o mesmo item lógico
// (ex.: acessório duplicado) não contarem em dobro.
//
// item_id XOR id_blueprint (CHECK no banco, ver migration
// 20261206010000): uma peça ou aponta pra um Item específico (sempre foi
// assim), ou pra um ForgeBlueprint da Forja — nesse segundo caso,
// QUALQUER raridade que aquele blueprint produz (ForgeBlueprintResult)
// satisfaz a peça. Isso existe porque cada raridade de um equipamento é
// uma linha PRÓPRIA de Item (stats diferentes de verdade), então sem
// isso um conjunto ficava preso a uma raridade específica do "mesmo"
// equipamento.
const EquipmentSetPiece = sequelize.define(
  "EquipmentSetPiece",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    equipment_set_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: true },
    id_blueprint: { type: DataTypes.INTEGER, allowNull: true },
    piece_key: { type: DataTypes.STRING(100), allowNull: false },
    ordem: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "equipment_set_pieces" },
);

module.exports = EquipmentSetPiece;
