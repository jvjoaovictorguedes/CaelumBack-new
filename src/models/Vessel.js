const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de embarcações (spec §18.2/§18.4) — camada de ACESSO, não
// simulador naval (sem durabilidade/combustível na V1).
const Vessel = sequelize.define(
  "Vessel",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    tier: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    nivel_pesca_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    preco: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "vessels" },
);

module.exports = Vessel;
