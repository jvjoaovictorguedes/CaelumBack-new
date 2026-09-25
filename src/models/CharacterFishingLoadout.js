const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Vara ativa do personagem (spec §9.4) — aponta pra uma
// CharacterEquipmentInstance cujo estado PERMANECE "Inventario" (nunca
// "Equipada" — esse estado é reservado pra equipamento de combate,
// spec §9.2).
const CharacterFishingLoadout = sequelize.define(
  "CharacterFishingLoadout",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    id_instancia_vara: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "character_fishing_loadout" },
);

module.exports = CharacterFishingLoadout;
