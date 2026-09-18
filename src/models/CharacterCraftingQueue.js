const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// No máximo 1 linha por personagem (id_personagem é a PK) — representa
// a forja em andamento. Apagada ao coletar, liberando o slot.
const CharacterCraftingQueue = sequelize.define(
  "CharacterCraftingQueue",
  {
    id_personagem: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    id_receita: { type: DataTypes.INTEGER, allowNull: false },
    iniciado_em: { type: DataTypes.DATE, allowNull: false },
    pronto_em: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: "character_crafting_queue" },
);

module.exports = CharacterCraftingQueue;
