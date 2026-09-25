const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Pool de encontro de uma zona (spec §8.3) — encounter_weight é peso
// RELATIVO (> 0); a probabilidade é normalizada em código
// (fishingEncounterService), nunca guardada como percentual fixo.
const FishingZoneSpecies = sequelize.define(
  "FishingZoneSpecies",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_zone: { type: DataTypes.INTEGER, allowNull: false },
    id_species: { type: DataTypes.INTEGER, allowNull: false },
    encounter_weight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100, validate: { min: 1 } },
    nivel_pesca_minimo: { type: DataTypes.INTEGER, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "fishing_zone_species",
    indexes: [{ unique: true, fields: ["id_zone", "id_species"] }],
  },
);

module.exports = FishingZoneSpecies;
