const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Mission = sequelize.define(
  "Mission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(100), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: false },
    tipo: {
      type: DataTypes.ENUM("MatarInimigos", "VencerDuelos", "GanharOuro", "AlcancarNivel"),
      allowNull: false,
    },
    meta: { type: DataTypes.INTEGER, allowNull: false },
    categoria: {
      type: DataTypes.ENUM("Diaria", "Unica"),
      allowNull: false,
      defaultValue: "Diaria",
    },
    nivel_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    recompensa_dinheiro: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recompensa_xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    recompensa_item_id: { type: DataTypes.INTEGER, allowNull: true },
    recompensa_item_quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    ativa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "missions" },
);

module.exports = Mission;
