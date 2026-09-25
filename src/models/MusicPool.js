const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo de Músicas §3.3 — pool nomeado (ex.: Combate,
// Mapa). Membership/pesos vivem em MusicPoolTrackAssignment, versionados
// junto da publicação (§3.6) — o pool em si é só a identidade estável.
const MusicPool = sequelize.define(
  "MusicPool",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(120), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "music_pools" },
);

module.exports = MusicPool;
