"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("PvpStatuses", {
      // 1 status por personagem: personagem_id é a própria chave primária,
      // em vez de criar um "id" surrogate que ninguém vai usar.
      personagem_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: {
          model: "Characters",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      total_batalhas: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      vitorias: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      derrotas: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      sequencia_vitorias: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      maximo_sequencia_vitorias: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      sistema_classificacao: {
        type: Sequelize.ENUM("Elo", "Nivel", "Vitorias", "Trofeus", "Rank"),
        allowNull: false,
      },
      ultima_batalha_dia: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
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
    await queryInterface.dropTable("PvpStatuses");
    // Postgres não apaga o ENUM sozinho quando a tabela é derrubada.
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_PvpStatuses_sistema_classificacao";',
    );
  },
};
