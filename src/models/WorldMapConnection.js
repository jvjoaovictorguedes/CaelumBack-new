// Estrada/rota visual entre dois WorldMapNode (spec "Mapa de Caelum v1"
// §22) — puramente cosmética nesta versão: não bloqueia movimento, não
// calcula viagem/tempo/stamina (spec §5/§46). Preparação pra uma futura
// camada de viagem/caravanas/encontros de estrada.
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const WorldMapConnection = sequelize.define(
  "WorldMapConnection",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_origem: { type: DataTypes.INTEGER, allowNull: false },
    id_destino: { type: DataTypes.INTEGER, allowNull: false },
    tipo: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "Estrada" },
    ordem: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "world_map_connections" },
);

module.exports = WorldMapConnection;
