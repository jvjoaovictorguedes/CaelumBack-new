"use strict";

// Baseline: a tabela "Items" já existe em produção, criada via
// sequelize.sync({alter:true}). Esta migration só formaliza o schema atual
// em versionamento — se a tabela já existir, não faz nada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("Items")) {
      console.log('[migration] Tabela "Items" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("Items", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      descricao: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      tipo_item: {
        type: Sequelize.ENUM(
          "Consumivel",
          "Armadura",
          "Capacete",
          "Escudo",
          "Arma",
          "Acessorio1",
          "Acessorio2",
          "Material",
          "QuestItem",
          "Currencia",
        ),
        allowNull: false,
      },
      raridade: {
        type: Sequelize.ENUM(
          "Comum",
          "Incomum",
          "Raro",
          "Epico",
          "Lendario",
          "Mitico",
        ),
        allowNull: false,
      },
      valor_compra: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      valor_venda: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      peso: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0.0,
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

  async down(queryInterface) {
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "Items" em produção).',
    );
  },
};
