"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("PvpMatches", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      tempo_inical_combate: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      tempo_final_combate: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      id_vencedor: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Characters", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      id_perdedor: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Characters", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      nome_arena: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      duracao_segundos: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      vencedor_pontos: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      perdedor_pontos: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("PvpMatches");
  },
};
