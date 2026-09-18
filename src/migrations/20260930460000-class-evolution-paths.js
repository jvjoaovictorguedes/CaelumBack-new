"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("class_evolution_paths")) {
      console.log("[migration] Tabela class_evolution_paths já existe — pulando criação.");
      return;
    }

    await queryInterface.createTable("class_evolution_paths", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_classe: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Classes", key: "id" },
      },
      nome: { type: Sequelize.STRING(100), allowNull: false },
      descricao: { type: Sequelize.TEXT, allowNull: false },
      nivel_necessario: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      id_item_requisito: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Items", key: "id" },
      },
      quantidade_item_requisito: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      bonus_forca: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      bonus_vitalidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      bonus_agilidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      bonus_inteligencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      bonus_velocidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      imagem_url: { type: Sequelize.STRING(255), allowNull: true },
      ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("class_evolution_paths");
  },
};
