const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Histórico IMUTÁVEL de captura individual (spec §16) — vender/consumir
// o Item do peixe NUNCA apaga/altera esta linha (spec §12.1/§38).
const FishingCatchRecord = sequelize.define(
  "FishingCatchRecord",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_species: { type: DataTypes.INTEGER, allowNull: false },
    id_zone: { type: DataTypes.INTEGER, allowNull: false },
    id_session: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    weight_g: { type: DataTypes.INTEGER, allowNull: false },
    quality: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    id_rod_item: { type: DataTypes.INTEGER, allowNull: true },
    refinamento_vara_snapshot: { type: DataTypes.INTEGER, allowNull: true },
    id_bait_item: { type: DataTypes.INTEGER, allowNull: true },
    caught_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "fishing_catch_records", updatedAt: false },
);

module.exports = FishingCatchRecord;
