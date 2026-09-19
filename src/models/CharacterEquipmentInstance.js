const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Cópia individual de um equipamento — duas instâncias do mesmo Item
// podem ter refinamento diferente (spec Inventário v2 §26). Desde a
// unificação v2 (§4), TODO equipamento (arma/armadura/escudo/acessório)
// vive aqui, não só o que sai da Forja v3 — ver equipmentInstanceService.js
// (fonte única de criação/transferência/equipagem) e a migration
// 20261002030000 que converteu os stacks legados em CharacterInventory
// pra instâncias.
//
// `estado` é a autoridade sobre onde a instância está (Inventario =
// solta no inventário do dono, Equipada = ocupando um slot em
// CharacterEquipment, Mercado = anunciada, não pode ser equipada nem
// tocada pelo dono até o anúncio ser cancelado/vendido). `equipada`
// continua existindo só por compatibilidade com código antigo que
// ainda lê o booleano — SEMPRE sincronizado com `estado` pelo mesmo
// service, nunca gravado à parte.
const CharacterEquipmentInstance = sequelize.define(
  "CharacterEquipmentInstance",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_item: { type: DataTypes.INTEGER, allowNull: false },
    refinamento: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    equipada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    estado: {
      type: DataTypes.ENUM("Inventario", "Equipada", "Mercado"),
      allowNull: false,
      defaultValue: "Inventario",
    },
  },
  { tableName: "character_equipment_instances" },
);

module.exports = CharacterEquipmentInstance;
