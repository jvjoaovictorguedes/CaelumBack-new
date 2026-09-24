const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Catálogo de conjuntos de equipamento (Especificação Sistema de
// Conjuntos §4.1). `ativo: false` desliga o bônus do conjunto sem
// apagar dados (§3/§3 "Consequência arquitetural").
const EquipmentSet = sequelize.define(
  "EquipmentSet",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    nome: { type: DataTypes.STRING(120), allowNull: false },
    descricao: { type: DataTypes.TEXT, allowNull: true },
    imagem_url: { type: DataTypes.STRING(255), allowNull: true },
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "equipment_sets" },
);

module.exports = EquipmentSet;
