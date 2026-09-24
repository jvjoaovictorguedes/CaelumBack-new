const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const UserAdminRole = sequelize.define(
  "UserAdminRole",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_user: { type: DataTypes.INTEGER, allowNull: false },
    id_role: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: "user_admin_roles" },
);

module.exports = UserAdminRole;
