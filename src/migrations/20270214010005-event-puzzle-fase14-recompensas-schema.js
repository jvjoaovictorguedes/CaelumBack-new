"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 14 (Recompensas
// temáticas do evento). Catálogo ADMIN (puzzle_reward_definitions) +
// histórico idempotente por personagem (character_puzzle_reward_grants)
// — mesmo par catálogo/histórico das Fases 9/10 (pistas/pioneiros), ver
// eventPuzzleRewardModels.js pro raciocínio completo.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("puzzle_reward_definitions")) {
      await queryInterface.createTable("puzzle_reward_definitions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_blueprint: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "puzzle_blueprints", key: "id" },
          onDelete: "RESTRICT",
        },
        key: { type: Sequelize.STRING(60), allowNull: false },
        titulo_exibicao: { type: Sequelize.STRING(160), allowNull: false },
        descricao_exibicao: { type: Sequelize.TEXT, allowNull: false },
        trigger_type: { type: Sequelize.ENUM("OBJECTIVE_COMPLETED", "INSTANCE_COMPLETED"), allowNull: false },
        objective_id: { type: Sequelize.STRING(60), allowNull: true },
        reward_ouro: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        reward_xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        item_quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        achievement_key: { type: Sequelize.STRING(60), allowNull: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("puzzle_reward_definitions", {
        fields: ["id_blueprint", "key"],
        type: "unique",
        name: "puzzle_reward_definitions_blueprint_key_unique",
      });
    }

    if (!tabelas.includes("character_puzzle_reward_grants")) {
      await queryInterface.createTable("character_puzzle_reward_grants", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
          onDelete: "SET NULL",
        },
        id_reward_definition: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "puzzle_reward_definitions", key: "id" },
          onDelete: "CASCADE",
        },
        granted_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // Garantia real de "nunca paga duas vezes" pra mesma definição —
      // ver puzzleRewardService.sincronizarRecompensas.
      await queryInterface.addConstraint("character_puzzle_reward_grants", {
        fields: ["id_personagem", "id_reward_definition"],
        type: "unique",
        name: "character_puzzle_reward_grants_personagem_definicao_unique",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_puzzle_reward_grants");
    await queryInterface.dropTable("puzzle_reward_definitions");
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_puzzle_reward_definitions_trigger_type";');
  },
};
