"use strict";

// Garante "um sorteio de raça e um sorteio de classe por conta" de
// verdade — antes disso, o único freio era um rate limit em memória (5
// tentativas/hora), que (a) zera num restart do servidor e (b) não
// impede o jogador de simplesmente esperar a janela passar e tentar de
// novo. Essa tabela é a fonte de verdade: uma vez que o sorteio de
// raça/classe rodou pra uma conta, o resultado (ganhou ou não, e qual
// opção rara se ganhou classe) fica gravado aqui pra sempre — qualquer
// chamada seguinte a /races|classes/sortear-raro devolve exatamente o
// mesmo resultado, nunca rola de novo.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_creation_rolls")) {
      console.log('[migration] "character_creation_rolls" já existe — pulando.');
      return;
    }

    await queryInterface.createTable("character_creation_rolls", {
      id_usuario: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      race_roll_done: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      race_rare_won: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      class_roll_done: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      class_rare_won: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      class_rare_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Classes", key: "id" },
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
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_creation_rolls")) {
      await queryInterface.dropTable("character_creation_rolls");
    }
  },
};
