const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Porto (spec §18.2) — liga um WorldMapNode existente a um ponto de
// partida marítimo.
const FishingPort = sequelize.define(
  "FishingPort",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    id_world_node: { type: DataTypes.INTEGER, allowNull: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "fishing_ports" },
);

module.exports = FishingPort;
