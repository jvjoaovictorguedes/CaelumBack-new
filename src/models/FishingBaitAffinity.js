const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Afinidade isca x espécie (spec §8.4) — multiplicador em PPM (1_000_000
// = neutro) sobre o encounter_weight; nunca garante a espécie.
const FishingBaitAffinity = sequelize.define(
  "FishingBaitAffinity",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_bait_item: { type: DataTypes.INTEGER, allowNull: false },
    id_species: { type: DataTypes.INTEGER, allowNull: false },
    multiplicador_peso_ppm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1_000_000 },
  },
  {
    tableName: "fishing_bait_affinities",
    indexes: [{ unique: true, fields: ["id_bait_item", "id_species"] }],
  },
);

module.exports = FishingBaitAffinity;
