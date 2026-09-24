const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Log IMUTÁVEL de ação administrativa (Painel Administrativo §44) —
// nunca atualizado nem apagado por código nenhum, só INSERT.
const AdminActionLog = sequelize.define(
  "AdminActionLog",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_admin: { type: DataTypes.INTEGER, allowNull: false },
    acao: { type: DataTypes.STRING(80), allowNull: false },
    entidade: { type: DataTypes.STRING(80), allowNull: false },
    id_entidade: { type: DataTypes.INTEGER, allowNull: true },
    dados_antes: { type: DataTypes.JSONB, allowNull: true },
    dados_depois: { type: DataTypes.JSONB, allowNull: true },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    ip: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "admin_action_logs", updatedAt: false },
);

module.exports = AdminActionLog;
