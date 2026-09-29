"use strict";

// Profissão de Ferreiro §6/§9.3 — Ferraria: ferramentas profissionais
// (Fole/Martelo/Tenaz), reaproveitando o mesmo Item.tipo_item
// "Ferramenta" e o pipeline de instância/raridade/refinamento que Vara
// de Pesca já usa (nenhuma mudança em Item/CharacterEquipmentInstance —
// ver equipmentInstanceService.TIPOS_INSTANCIAVEIS, já inclui
// "Ferramenta").
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("forge_tool_properties")) {
      await queryInterface.createTable("forge_tool_properties", {
        id_item: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
        slot: { type: Sequelize.ENUM("Fole", "Martelo", "Tenaz"), allowNull: false },
        nivel_ferreiro_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      });
    }

    if (!tabelas.includes("forge_tool_effects")) {
      await queryInterface.createTable("forge_tool_effects", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_item: { type: Sequelize.INTEGER, allowNull: false },
        effect_key: {
          type: Sequelize.ENUM("SMELTING_BONUS_BAR_PPM", "CRAFTING_QUALITY_BONUS_PPM", "REFINEMENT_SUCCESS_BONUS_PPM"),
          allowNull: false,
        },
        valor_ppm: { type: Sequelize.INTEGER, allowNull: false },
      });
    }

    if (!tabelas.includes("character_forge_tool_loadout")) {
      await queryInterface.createTable("character_forge_tool_loadout", {
        id_personagem: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false },
        id_instancia_fole: { type: Sequelize.INTEGER, allowNull: true },
        id_instancia_martelo: { type: Sequelize.INTEGER, allowNull: true },
        id_instancia_tenaz: { type: Sequelize.INTEGER, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_forge_tool_loadout").catch(() => {});
    await queryInterface.dropTable("forge_tool_effects").catch(() => {});
    await queryInterface.dropTable("forge_tool_properties").catch(() => {});
  },
};
