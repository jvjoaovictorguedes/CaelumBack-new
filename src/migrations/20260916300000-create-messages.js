"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("messages")) {
      console.log('[migration] Tabela "messages" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("messages", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      id_remetente: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      id_destinatario: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      conteudo: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      lida: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
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

    await queryInterface.addIndex("messages", ["id_remetente", "id_destinatario"]);
    await queryInterface.addIndex("messages", ["id_destinatario", "lida"]);
  },

  async down(queryInterface) {
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "messages" em produção).',
    );
  },
};
