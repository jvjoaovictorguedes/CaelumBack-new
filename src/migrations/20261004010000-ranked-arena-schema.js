"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("pvp_seasons")) {
      await queryInterface.createTable("pvp_seasons", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        starts_at: { type: Sequelize.DATE, allowNull: false },
        ends_at: { type: Sequelize.DATE, allowNull: false },
        status: {
          type: Sequelize.ENUM("Agendada", "Ativa", "Encerrada"),
          allowNull: false,
          defaultValue: "Agendada",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    } else {
      console.log('[migration] "pvp_seasons" já existe — pulando criação.');
    }

    if (!tabelas.includes("character_pvp_seasons")) {
      await queryInterface.createTable("character_pvp_seasons", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
        },
        season_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "pvp_seasons", key: "id" },
        },
        rating: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1000 },
        jogos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        vitorias: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        derrotas: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        peak_rating: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1000 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addIndex("character_pvp_seasons", ["character_id", "season_id"], {
        unique: true,
        name: "character_pvp_seasons_character_season_unique",
      });
      await queryInterface.addIndex("character_pvp_seasons", ["season_id", "rating"]);
    } else {
      console.log('[migration] "character_pvp_seasons" já existe — pulando criação.');
    }

    if (!tabelas.includes("ranked_matches")) {
      await queryInterface.createTable("ranked_matches", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        season_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "pvp_seasons", key: "id" },
        },
        id_jogador1: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
        },
        id_jogador2: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
        },
        id_vencedor: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
        },
        rating_jogador1_antes: { type: Sequelize.INTEGER, allowNull: false },
        rating_jogador1_depois: { type: Sequelize.INTEGER, allowNull: true },
        rating_jogador2_antes: { type: Sequelize.INTEGER, allowNull: false },
        rating_jogador2_depois: { type: Sequelize.INTEGER, allowNull: true },
        motivo_encerramento: {
          type: Sequelize.ENUM("Vitoria", "Abandono", "FalhaServidor"),
          allowNull: true,
        },
        iniciada_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        encerrada_em: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addIndex("ranked_matches", ["season_id"]);
      await queryInterface.addIndex("ranked_matches", ["id_jogador1"]);
      await queryInterface.addIndex("ranked_matches", ["id_jogador2"]);
    } else {
      console.log('[migration] "ranked_matches" já existe — pulando criação.');
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("ranked_matches");
    await queryInterface.dropTable("character_pvp_seasons");
    await queryInterface.dropTable("pvp_seasons");
  },
};
