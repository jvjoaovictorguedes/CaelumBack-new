const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Perfil administrativo (Painel Administrativo §6/§7) — refina o que um
// admin pode fazer DEPOIS de já ter passado por User.isAdmin.
const AdminRole = sequelize.define(
  "AdminRole",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    nome: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    descricao: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "admin_roles" },
);

module.exports = AdminRole;
