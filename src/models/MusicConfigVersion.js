const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Painel Administrativo de Músicas §3.4/§10 — uma versão de configuração
// completa (assignments + pool memberships). Só UMA pode estar
// PUBLISHED por vez (garantido em transaction por musicConfigService,
// nunca só por índice único — publicar exige arquivar a anterior no
// mesmo commit).
const MusicConfigVersion = sequelize.define(
  "MusicConfigVersion",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    version_number: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM("DRAFT", "PUBLISHED", "ARCHIVED"),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    published_by: { type: DataTypes.INTEGER, allowNull: true },
    published_at: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "music_config_versions" },
);

module.exports = MusicConfigVersion;
