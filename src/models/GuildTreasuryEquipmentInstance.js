const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Tesouro da Guilda V2 §6.2 — representação de uma cópia FÍSICA de
// equipamento/ferramenta enquanto pertence ao Tesouro (patrimônio da
// GUILDA, não de nenhum personagem). Tabela própria em vez de deixar
// id_personagem nullable em CharacterEquipmentInstance de propósito —
// a spec pede evitar esse impacto no sistema de equipamentos existente.
// Preserva raridade/refinamento da instância original; ao retirar, uma
// nova CharacterEquipmentInstance é criada (equipmentInstanceService.create)
// com os MESMOS valores, e esta linha é destruída — nunca duas cópias
// físicas do mesmo item coexistindo (guildTreasuryService.js).
const GuildTreasuryEquipmentInstance = sequelize.define(
  "GuildTreasuryEquipmentInstance",
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
    raridade: {
      type: DataTypes.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
      allowNull: true,
    },
    refinamento: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    depositado_por: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Characters", key: "id" },
    },
    depositado_em: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { tableName: "GuildTreasuryEquipmentInstances" },
);

module.exports = GuildTreasuryEquipmentInstance;
