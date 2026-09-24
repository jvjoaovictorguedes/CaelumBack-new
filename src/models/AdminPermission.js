const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Chave estável de permissão (Painel Administrativo §6) — nunca lida
// por nome em português em código nenhum, só pela `chave`.
const AdminPermission = sequelize.define(
  "AdminPermission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    chave: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "admin_permissions" },
);

module.exports = AdminPermission;
