const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Rota marítima (spec §18.3) — estende WorldMapConnection (que já tem
// `tipo` como STRING livre, não ENUM — usamos o valor "RotaMaritima"
// sem precisar de migration de enum aqui). Origem/destino vêm da própria
// WorldMapConnection; este model só guarda o que é específico de Pesca.
const MarineRoute = sequelize.define(
  "MarineRoute",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_world_connection: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    id_port_origem: { type: DataTypes.INTEGER, allowNull: false },
    id_zone_destino: { type: DataTypes.INTEGER, allowNull: false },
    min_vessel_tier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    distance: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "marine_routes" },
);

module.exports = MarineRoute;
