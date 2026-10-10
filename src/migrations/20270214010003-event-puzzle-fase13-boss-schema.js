"use strict";

// Evento "O Coração da Máquina Celestial" — Fase 13: Boss Custódio do
// Meridiano. Clone estrutural das tabelas do Guardião do Templo
// (20270210030000-temple-fase5-guardiao.js) — mesmo raciocínio, ver
// eventPuzzleBossModels.js pro porquê das duas diferenças (id_blueprint_
// gatilho em vez de boss_unlocked_at; sem catálogo de loot sorteável
// nesta fase).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("event_puzzle_boss_configs")) {
      await queryInterface.createTable("event_puzzle_boss_configs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event_definition: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "event_definitions", key: "id" },
          onDelete: "CASCADE",
        },
        id_monstro_base: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "AdventureMonsters", key: "id" },
          onDelete: "RESTRICT",
        },
        id_blueprint_gatilho: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "puzzle_blueprints", key: "id" },
          onDelete: "RESTRICT",
        },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: true },
        lore: { type: Sequelize.TEXT, allowNull: true },
        target_turns_to_kill: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 8 },
        target_boss_actions_survivable: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 6 },
        scaling_min_multiplier: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0.5 },
        scaling_max_multiplier: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 3 },
        reward_ouro_primeira_vitoria: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        reward_xp_primeira_vitoria: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("event_puzzle_boss_phases")) {
      await queryInterface.createTable("event_puzzle_boss_phases", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "event_puzzle_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        hp_threshold_pct: { type: Sequelize.INTEGER, allowNull: false },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: true },
        dano_multiplicador: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        defesa_multiplicador: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        enrage: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("event_puzzle_boss_status_resistances")) {
      await queryInterface.createTable("event_puzzle_boss_status_resistances", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "event_puzzle_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        status_key: { type: Sequelize.STRING(40), allowNull: false },
        imune: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        resistencia_pct: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("event_puzzle_boss_status_resistances", {
        fields: ["id_boss_config", "status_key"],
        type: "unique",
        name: "event_puzzle_boss_status_resistances_config_status_unique",
      });
    }

    if (!tabelas.includes("event_puzzle_boss_attempts")) {
      await queryInterface.createTable("event_puzzle_boss_attempts", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event_edition: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "event_editions", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        status: { type: Sequelize.ENUM("Ativa", "Vitoria", "Derrota", "Abandonada"), allowNull: false, defaultValue: "Ativa" },
        player_snapshot: { type: Sequelize.JSONB, allowNull: false },
        boss_snapshot: { type: Sequelize.JSONB, allowNull: false },
        runtime_state: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        cleared_at: { type: Sequelize.DATE, allowNull: true },
        reward_granted_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // Mesma garantia do Templo — só UMA tentativa Ativa por
      // personagem+edição ao mesmo tempo (histórico de tentativas
      // anteriores continua, nunca duas EM ANDAMENTO juntas).
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX event_puzzle_boss_attempts_uma_ativa_idx
        ON event_puzzle_boss_attempts (id_event_edition, character_id)
        WHERE status = 'Ativa';
      `);
    }

    if (!tabelas.includes("event_puzzle_boss_reward_grants")) {
      await queryInterface.createTable("event_puzzle_boss_reward_grants", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event_edition: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "event_editions", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_attempt: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "event_puzzle_boss_attempts", key: "id" },
          onDelete: "CASCADE",
        },
        ouro_concedido: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        xp_concedido: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // Primeira vitória paga EXATAMENTE uma vez por edição+personagem.
      await queryInterface.addConstraint("event_puzzle_boss_reward_grants", {
        fields: ["id_event_edition", "character_id"],
        type: "unique",
        name: "event_puzzle_boss_reward_grants_edition_character_unique",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("event_puzzle_boss_reward_grants");
    await queryInterface.dropTable("event_puzzle_boss_attempts");
    await queryInterface.dropTable("event_puzzle_boss_status_resistances");
    await queryInterface.dropTable("event_puzzle_boss_phases");
    await queryInterface.dropTable("event_puzzle_boss_configs");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_event_puzzle_boss_attempts_status";');
  },
};
