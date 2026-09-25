const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo de Músicas §3.6 — membership de uma track num
// pool, DENTRO de uma MusicConfigVersion (versiona o membership junto
// da publicação, igual assignments). `peso` é inteiro positivo pra
// sorteio ponderado — nunca porcentagem armazenada (§9.1).
const MusicPoolTrackAssignment = sequelize.define(
  "MusicPoolTrackAssignment",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_config_version: { type: DataTypes.INTEGER, allowNull: false },
    id_pool: { type: DataTypes.INTEGER, allowNull: false },
    id_track: { type: DataTypes.INTEGER, allowNull: false },
    peso: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "music_pool_track_assignments" },
);

module.exports = MusicPoolTrackAssignment;
