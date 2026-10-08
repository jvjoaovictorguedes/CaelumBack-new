const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Tesouro da Guilda V2 §6.3 — ledger ESTRUTURADO e IMUTÁVEL de
// movimentações de item (depósito/retirada), separado de GuildLog (que
// continua sendo o feed humano/auditoria geral — §10 da spec:
// "não usar GuildLog.detalhes como único banco de dados da
// movimentação"). Sem updatedAt: nenhuma linha aqui é editada depois de
// criada. item_nome_snapshot/raridade_snapshot/refinamento_snapshot
// garantem que o histórico continue legível mesmo se o Item catálogo
// for renomeado/rebalanceado depois.
const GuildTreasuryItemTransaction = sequelize.define(
  "GuildTreasuryItemTransaction",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    // Nullable — sobrevive à exclusão da conta de quem fez a
    // movimentação (mesma política histórica de GuildLog/claims).
    id_personagem: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    operation: { type: DataTypes.ENUM("DEPOSITO", "RETIRADA"), allowNull: false },
    id_item: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Items", key: "id" },
    },
    // Sem FK de propósito — ver comentário da migration. Em retirada de
    // equipamento, a linha de GuildTreasuryEquipmentInstance referenciada
    // é removida na mesma transaction deste registro.
    id_treasury_equipment_instance: { type: DataTypes.INTEGER, allowNull: true },
    quantidade: { type: DataTypes.INTEGER, allowNull: true },
    item_nome_snapshot: { type: DataTypes.STRING(120), allowNull: false },
    raridade_snapshot: {
      type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
      allowNull: true,
    },
    refinamento_snapshot: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: "GuildTreasuryItemTransactions", updatedAt: false },
);

module.exports = GuildTreasuryItemTransaction;
