const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Templo do Véu Celestial — âncora de idempotência de um draw 1x/10x
// (§14.1). UNIQUE (character_id, client_request_id): retry com o mesmo
// client_request_id nunca debita Sigilos de novo, só devolve o mesmo
// resultado já gravado em TempleDrawHistory.
const TempleDrawBatch = sequelize.define(
  "TempleDrawBatch",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_event: { type: DataTypes.INTEGER, allowNull: false },
    character_id: { type: DataTypes.INTEGER, allowNull: false },
    client_request_id: { type: DataTypes.STRING(120), allowNull: false },
    quantidade: { type: DataTypes.INTEGER, allowNull: false },
    custo_total: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "temple_draw_batches" },
);

module.exports = TempleDrawBatch;
