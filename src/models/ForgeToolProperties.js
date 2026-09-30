const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

// Profissão de Ferreiro §6 — metadados de uma ferramenta PROFISSIONAL
// (Fole/Martelo/Tenaz). id_item é o mesmo Item tipo_item "Ferramenta"
// que Vara de Pesca já usa (mesmo pipeline de instância/raridade/
// refinamento — ver equipmentInstanceService.TIPOS_INSTANCIAVEIS); a
// presença desta linha 1:1 é o que distingue "ferramenta de Ferraria"
// de "vara de pesca" pro mesmo tipo_item, mesmo padrão de
// FishingRodProperties.
const ForgeToolProperties = sequelize.define(
  "ForgeToolProperties",
  {
    id_item: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
    slot: { type: DataTypes.ENUM("Fole", "Martelo", "Tenaz"), allowNull: false },
    nivel_ferreiro_minimo: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    // Painel Administrativo — desativar é a ação padrão em vez de
    // excluir (mesmo critério de Item.ativo/ForgeScroll.ativo).
    ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { tableName: "forge_tool_properties", timestamps: false },
);

module.exports = ForgeToolProperties;
