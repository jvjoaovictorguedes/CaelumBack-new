"use strict";

// Baseline: a tabela "Classes" já existe em produção, criada via
// sequelize.sync({alter:true}). Esta migration só formaliza o schema atual
// em versionamento — se a tabela já existir, não faz nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("Classes")) {
      console.log('[migration] Tabela "Classes" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("Classes", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      descricao: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      multiplicador_vida_por_nivel: {
        type: Sequelize.FLOAT,
        defaultValue: 1.0,
        allowNull: false,
      },
      multiplicador_mana_por_nivel: {
        type: Sequelize.FLOAT,
        defaultValue: 1.0,
        allowNull: false,
      },
      imagem_url: {
        type: Sequelize.STRING(255),
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
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "Classes" em produção).',
    );
  },
};
