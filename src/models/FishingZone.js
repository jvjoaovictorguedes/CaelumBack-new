const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Zona de pesca (spec §8.2) — liga a um WorldMapNode existente; nunca
// cria um segundo mapa.
const FishingZone = sequelize.define(
  "FishingZone",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    id_world_node: { type: DataTypes.INTEGER, allowNull: true },
    nivel_pesca_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    tier_embarcacao_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    dificuldade_ambiente: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "fishing_zones" },
);

module.exports = FishingZone;
