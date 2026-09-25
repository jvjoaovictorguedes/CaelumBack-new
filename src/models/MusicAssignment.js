const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo de Músicas §3.5 — o que um slot_key toca numa
// dada MusicConfigVersion. UNIQUE(id_config_version, slot_key) — nunca
// duas linhas pro mesmo slot na mesma versão.
const MusicAssignment = sequelize.define(
  "MusicAssignment",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_config_version: { type: DataTypes.INTEGER, allowNull: false },
    slot_key: { type: DataTypes.STRING(80), allowNull: false },
    assignment_type: {
      type: DataTypes.ENUM("TRACK", "POOL", "SILENCE"),
      allowNull: false,
    },
    id_track: { type: DataTypes.INTEGER, allowNull: true },
    id_pool: { type: DataTypes.INTEGER, allowNull: true },
    fade_ms: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "music_assignments" },
);

module.exports = MusicAssignment;
