"use strict";

// Admin de Ferramentas de Ferraria — desativar (soft disable) em vez de
// excluir, mesmo padrão de Item.ativo/ForgeScroll.ativo.
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("forge_tool_properties");
    if (!colunas.ativo) {
      await queryInterface.addColumn("forge_tool_properties", "ativo", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("forge_tool_properties", "ativo").catch(() => {});
  },
};
