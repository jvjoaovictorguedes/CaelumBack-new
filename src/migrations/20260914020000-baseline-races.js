"use strict";

// Baseline: a tabela "Races" já existe em produção, criada via
// sequelize.sync({alter:true}). Esta migration só formaliza o schema atual
// em versionamento — se a tabela já existir, não faz nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("Races")) {
      console.log('[migration] Tabela "Races" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("Races", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      nome_masculino: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      nome_feminino: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      descricao_masculina: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      descricao_feminina: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      bonus_forca: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_vitalidade: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_agilidade: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_inteligencia: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      bonus_velocidade: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      imagem_masculina_url: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      imagem_feminina_url: {
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
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "Races" em produção).',
    );
  },
};
