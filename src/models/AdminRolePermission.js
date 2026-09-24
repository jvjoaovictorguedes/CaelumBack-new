const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AdminRolePermission = sequelize.define(
  "AdminRolePermission",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_role: { type: DataTypes.INTEGER, allowNull: false },
    id_permission: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "admin_role_permissions" },
);

module.exports = AdminRolePermission;
