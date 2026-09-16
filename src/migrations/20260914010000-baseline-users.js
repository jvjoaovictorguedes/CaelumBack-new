"use strict";

// Baseline: a tabela "users" já existe em produção, criada via
// sequelize.sync({alter:true}). Esta migration só formaliza o schema atual
// em versionamento — se a tabela já existir, não faz nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("users")) {
      console.log('[migration] Tabela "users" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("users", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      dataCriacao: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      ultimoLogin: {
        type: Sequelize.DATE,
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

  async down() {
    // Baseline não reverte: dropar "users" destruiria dados reais de
    // produção. Uma reversão de verdade tem que ser feita manualmente.
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "users" em produção).',
    );
  },
};
