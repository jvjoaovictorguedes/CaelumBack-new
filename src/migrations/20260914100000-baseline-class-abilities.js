"use strict";

// Baseline: tableName explícito no model ("class_abilities"), sem
// ambiguidade — só checa existência e cria se faltar.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes("class_abilities")) {
      console.log('[migration] Tabela "class_abilities" já existe — pulando criação.');
      return;
    }

    await queryInterface.createTable("class_abilities", {
      id_classe: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Classes", key: "id" },
      },
      id_poder: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "Powers", key: "id" },
      },
      nivel_aprendizagem: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        allowNull: false,
      },
    });
  },

  async down() {
    console.log(
      '[migration] down() de baseline é intencionalmente um no-op (não dropa "class_abilities" em produção).',
    );
  },
};
