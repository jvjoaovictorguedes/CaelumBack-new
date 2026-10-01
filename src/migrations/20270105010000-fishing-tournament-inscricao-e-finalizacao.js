"use strict";

// Ideia #1 da fila de melhorias — 2 bugs reportados no Torneio da Pesca:
//   1. Não pedia inscrição nenhuma (a versão original, 20260925010000,
//      foi deliberadamente enxuta assim — ver comentário lá). Agora o
//      jogador precisa se inscrever ATÉ o torneio começar; só captura de
//      quem se inscreveu conta pro placar.
//   2. Quando o torneio acabava, nada automático rodava: sem
//      vencedor registrado, sem ranking final persistido, e o torneio
//      continuava "ativo" pra sempre no admin. Agora um scheduler
//      (fishingTournamentScheduler.js, mesmo padrão de
//      worldBossScheduler.js) fecha isso sozinho.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("fishing_tournament_entries")) {
      await queryInterface.createTable("fishing_tournament_entries", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_tournament: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "fishing_tournaments", key: "id" },
          onDelete: "CASCADE",
        },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        inscrito_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("fishing_tournament_entries", {
        fields: ["id_tournament", "id_personagem"],
        type: "unique",
        name: "fishing_tournament_entries_torneio_personagem_unique",
      });
      // Consultado o tempo todo durante o torneio (é a lista que filtra
      // a agregação de pontuação) — precisa de índice pelo torneio.
      await queryInterface.addIndex("fishing_tournament_entries", ["id_tournament"]);
    }

    const colunas = await queryInterface.describeTable("fishing_tournaments");
    if (!colunas.finalizado_em) {
      await queryInterface.addColumn("fishing_tournaments", "finalizado_em", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!colunas.vencedor_character_id) {
      await queryInterface.addColumn("fishing_tournaments", "vencedor_character_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    if (!colunas.vencedor_nome) {
      // Snapshot denormalizado de propósito (mesmo raciocínio de
      // RankedMatch/outros "vencedor" no projeto): o personagem pode ser
      // deletado depois, mas o histórico do torneio tem que continuar
      // legível pra sempre.
      await queryInterface.addColumn("fishing_tournaments", "vencedor_nome", {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("fishing_tournament_entries");
    const colunas = await queryInterface.describeTable("fishing_tournaments");
    if (colunas.finalizado_em) await queryInterface.removeColumn("fishing_tournaments", "finalizado_em");
    if (colunas.vencedor_character_id) await queryInterface.removeColumn("fishing_tournaments", "vencedor_character_id");
    if (colunas.vencedor_nome) await queryInterface.removeColumn("fishing_tournaments", "vencedor_nome");
  },
};
