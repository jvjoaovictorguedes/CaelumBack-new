const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Tesouro da Guilda V2 §6.1 — estoque compartilhado de itens
// EMPILHÁVEIS. Chave é id_item (nunca nome/raridade textual, mesma
// semântica de CharacterInventory) — UNIQUE(id_guild, id_item) garante
// que addStack-style upsert nunca duplique linha pro mesmo item.
const GuildTreasuryStack = sequelize.define(
  "GuildTreasuryStack",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
    id_guild: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Guilds", key: "id" },
    },
    id_item: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Items", key: "id" },
    },
    quantidade: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  },
  {
    tableName: "GuildTreasuryStacks",
    indexes: [{ unique: true, fields: ["id_guild", "id_item"] }],
  },
);

module.exports = GuildTreasuryStack;
