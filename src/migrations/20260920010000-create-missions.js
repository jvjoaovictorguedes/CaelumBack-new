"use strict";

// Catálogo de missões (diárias e únicas) + progresso por personagem.
// Missões diárias resetam in-place (ver missionService.js) em vez de
// criar uma linha nova por dia — evita acumular histórico que ninguém
// consulta.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("missions")) {
      await queryInterface.createTable("missions", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        tipo: {
          type: Sequelize.ENUM("MatarInimigos", "VencerDuelos", "GanharOuro", "AlcancarNivel"),
          allowNull: false,
        },
        meta: { type: Sequelize.INTEGER, allowNull: false },
        categoria: {
          type: Sequelize.ENUM("Diaria", "Unica"),
          allowNull: false,
          defaultValue: "Diaria",
        },
        nivel_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        recompensa_dinheiro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        recompensa_xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        recompensa_item_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Items", key: "id" },
          onDelete: "SET NULL",
        },
        recompensa_item_quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_mission_progress")) {
      await queryInterface.createTable("character_mission_progress", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_mission: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "missions", key: "id" },
          onDelete: "CASCADE",
        },
        progresso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        concluida: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        recompensa_resgatada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        expira_em: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });

      await queryInterface.addConstraint("character_mission_progress", {
        fields: ["id_personagem", "id_mission"],
        type: "unique",
        name: "character_mission_progress_unico_por_personagem",
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("character_mission_progress")) {
      await queryInterface.dropTable("character_mission_progress");
    }
    if (tabelas.includes("missions")) {
      await queryInterface.dropTable("missions");
    }
  },
};
