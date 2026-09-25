const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Ledger leve de telemetria da Forja (Painel Administrativo §13/§14.1) —
// CharacterForgeQueue é destruída na coleta (nunca vira histórico), e
// adminAuditService é auditoria ADMINISTRATIVA, não telemetria de
// jogador (domínios diferentes, §13). Append-only: nunca editado/
// deletado por gameplay, só lido pelas Métricas do Painel.
const ForgeOperationMetric = sequelize.define(
  "ForgeOperationMetric",
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
    tipo_acao: { type: DataTypes.ENUM("Fundicao", "Fabricacao", "Refinamento"), allowNull: false },
    id_personagem: { type: DataTypes.INTEGER, allowNull: false },
    id_blueprint: { type: DataTypes.INTEGER, allowNull: true },
    id_recurso: { type: DataTypes.INTEGER, allowNull: true },
    categoria_equipamento: { type: DataTypes.STRING(30), allowNull: true },
    qualidade_base: { type: DataTypes.STRING(20), allowNull: true },
    qualidade_final: { type: DataTypes.STRING(20), allowNull: true },
    alvo_refinamento: { type: DataTypes.INTEGER, allowNull: true },
    sucesso: { type: DataTypes.BOOLEAN, allowNull: true },
    gold_delta: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    xp_ganho: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    id_item_pergaminho: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "forge_operation_metrics", updatedAt: false },
);

module.exports = ForgeOperationMetric;
