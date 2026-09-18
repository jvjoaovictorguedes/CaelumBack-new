const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const UserPatchNoteSeen = sequelize.define(
  "UserPatchNoteSeen",
  {
    id_usuario: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    ultimo_id_visto: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "user_patch_notes_seen" },
);

module.exports = UserPatchNoteSeen;
