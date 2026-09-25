const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo de Músicas §3.1 — identidade estável de uma
// faixa (a `key` não depende do nome físico do arquivo).
const MusicTrack = sequelize.define(
  "MusicTrack",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(120), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    loop: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    default_volume: { type: DataTypes.FLOAT, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "music_tracks" },
);

module.exports = MusicTrack;
