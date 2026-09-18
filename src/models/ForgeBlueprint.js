const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const ForgeBlueprint = sequelize.define(
  "ForgeBlueprint",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    categoria_equipamento: {
      type: DataTypes.ENUM("Arma", "Armadura", "Capacete", "Escudo", "Acessorio1", "Acessorio2"),
      allowNull: false,
    },
    multiplicador_tempo: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    nivel_forja_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "forge_blueprints" },
);

module.exports = ForgeBlueprint;
