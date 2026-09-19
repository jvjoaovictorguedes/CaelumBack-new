const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Área de Caça do Modo Aventura (§3/§22 da spec) — nivel_monstro_min/max
// é só RECOMENDADO, nunca bloqueia entrada (§4).
const AdventureZone = sequelize.define(
  "AdventureZone",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    nivel_monstro_min: { type: DataTypes.INTEGER, allowNull: false },
    nivel_monstro_max: { type: DataTypes.INTEGER, allowNull: false },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "AdventureZones",
  },
);

module.exports = AdventureZone;
