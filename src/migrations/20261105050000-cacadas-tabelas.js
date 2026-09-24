"use strict";

// Caçadas da Guilda dos Aventureiros — progresso permanente do Caçador
// (CharacterHunterProgress) + as ofertas/caçadas em si
// (CharacterAdventureHunt, 1 linha por janela de 4h por personagem).
// Também adiciona total_spoil_orders_completed ao progresso comercial
// do Balcão de Espólios (§11.1/§13.3 da spec de Caçadas).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    const colunasProgressoGuilda = await queryInterface.describeTable("character_adventure_guild_progress");
    if (!colunasProgressoGuilda.total_spoil_orders_completed) {
      await queryInterface.addColumn("character_adventure_guild_progress", "total_spoil_orders_completed", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    if (!tabelas.includes("character_hunter_progress")) {
      await queryInterface.createTable("character_hunter_progress", {
        id_personagem: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        reputation_points: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hunts_completed_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hunts_completed_dangerous: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hunts_completed_difficult: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hunts_completed_deadly: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hunts_completed_nightmare: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hunts_completed_extermination: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        monsters_killed_in_hunts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("character_adventure_hunts")) {
      await queryInterface.createTable("character_adventure_hunts", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_monstro: { type: Sequelize.INTEGER, allowNull: false, references: { model: "AdventureMonsters", key: "id" } },
        id_zona_referencia: { type: Sequelize.INTEGER, allowNull: true, references: { model: "AdventureZones", key: "id" } },
        rotation_start: { type: Sequelize.DATE, allowNull: false },
        rotation_end: { type: Sequelize.DATE, allowNull: false },
        status: {
          type: Sequelize.ENUM("Offered", "Active", "Completed", "Abandoned", "Expired"),
          allowNull: false,
          defaultValue: "Offered",
        },
        difficulty: {
          type: Sequelize.ENUM("Dangerous", "Difficult", "Deadly", "Nightmare", "Extermination"),
          allowNull: false,
        },
        quantity_required: { type: Sequelize.INTEGER, allowNull: false },
        progress: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        title_snapshot: { type: Sequelize.STRING(150), allowNull: false },
        story_template_key: { type: Sequelize.STRING(50), allowNull: false },
        story_snapshot: { type: Sequelize.TEXT, allowNull: false },
        hp_multiplier_snapshot: { type: Sequelize.FLOAT, allowNull: false },
        damage_multiplier_snapshot: { type: Sequelize.FLOAT, allowNull: false },
        reward_multiplier_snapshot: { type: Sequelize.FLOAT, allowNull: false },
        gold_reward_snapshot: { type: Sequelize.INTEGER, allowNull: false },
        reputation_reward_snapshot: { type: Sequelize.INTEGER, allowNull: false },
        recommended_power_snapshot: { type: Sequelize.INTEGER, allowNull: true },
        random_factor_snapshot: { type: Sequelize.FLOAT, allowNull: false },
        accepted_at: { type: Sequelize.DATE, allowNull: true },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        abandoned_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });

      await queryInterface.addIndex("character_adventure_hunts", ["id_personagem", "rotation_start"], {
        unique: true,
        name: "character_adventure_hunts_personagem_janela_unique",
      });

      // §13.2 "constraint/índice que assegure no máximo uma linha Active
      // por personagem" — índice único PARCIAL (só sobre status='Active'):
      // uma unique index comum em (id_personagem) bloquearia até as
      // linhas Offered/Completed/Abandoned/Expired do MESMO personagem em
      // janelas diferentes, que precisam conviver (histórico). Só o
      // estado Active é exclusivo.
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX character_adventure_hunts_uma_ativa_por_personagem
        ON character_adventure_hunts (id_personagem)
        WHERE status = 'Active';
      `);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_adventure_hunts");
    await queryInterface.dropTable("character_hunter_progress");
    await queryInterface.removeColumn("character_adventure_guild_progress", "total_spoil_orders_completed");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_character_adventure_hunts_status";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_character_adventure_hunts_difficulty";`);
  },
};
