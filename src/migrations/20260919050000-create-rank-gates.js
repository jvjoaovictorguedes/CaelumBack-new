"use strict";

// Portal de Ranque individual — chefe de stats FIXOS por ranque (F até
// S+; S++ é o teto e não tem portal). Vencer promove Character.rank pro
// próximo da escada (ver rankService.js). ultima_tentativa_rank_gate em
// Characters é o cooldown entre tentativas (evita spam de retry
// imediato após perder).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("rank_gates")) {
      await queryInterface.createTable("rank_gates", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: false, unique: true },
        nome_chefe: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        nivel_recomendado: { type: Sequelize.INTEGER, allowNull: false },
        vida: { type: Sequelize.INTEGER, allowNull: false },
        forca: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        vitalidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        agilidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        inteligencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        velocidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        defesa: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        recompensa_dinheiro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        recompensa_xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    const descricaoCharacters = await queryInterface.describeTable("Characters");
    if (!("ultima_tentativa_rank_gate" in descricaoCharacters)) {
      await queryInterface.addColumn("Characters", "ultima_tentativa_rank_gate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("rank_gates")) {
      await queryInterface.dropTable("rank_gates");
    }
    const descricaoCharacters = await queryInterface.describeTable("Characters");
    if ("ultima_tentativa_rank_gate" in descricaoCharacters) {
      await queryInterface.removeColumn("Characters", "ultima_tentativa_rank_gate");
    }
  },
};
