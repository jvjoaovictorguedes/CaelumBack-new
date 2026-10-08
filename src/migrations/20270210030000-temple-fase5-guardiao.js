"use strict";

// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 5: Provação Final / Guardião solo (§8/§9/§10/§11.1). O Guardião
// referencia um AdventureMonster (id_monstro_base, ai_profile
// ELITE_BOSS, temple_exclusive=true da Fase 1) — nunca um catálogo
// paralelo de monstro, Power, Status ou IA (documento não autoriza
// templeAiService/templePower/templeStatus/templeCombatPower).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("temple_boss_configs")) {
      await queryInterface.createTable("temple_boss_configs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "temple_events", key: "id" },
          onDelete: "CASCADE",
        },
        id_monstro_base: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "AdventureMonsters", key: "id" },
          onDelete: "RESTRICT",
        },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: true },
        lore: { type: Sequelize.TEXT, allowNull: true },
        // §9.2 — metas de calibração POR Convergência; null usa o
        // GAME_SETTINGS_DEFAULT (temple.boss.*) como fallback de produto.
        target_turns_to_kill: { type: Sequelize.INTEGER, allowNull: true },
        target_boss_actions_survivable: { type: Sequelize.INTEGER, allowNull: true },
        scaling_min_multiplier: { type: Sequelize.FLOAT, allowNull: true },
        scaling_max_multiplier: { type: Sequelize.FLOAT, allowNull: true },
        // §10.1 — quantidade FIXA de Sigilos no primeiro clear, igual
        // pra todo nível quando a dificuldade relativa foi calibrada.
        reward_sigils_primeira_vitoria: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("temple_boss_phases")) {
      await queryInterface.createTable("temple_boss_phases", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Fase ativa quando vida_atual/vida_maxima * 100 <= este valor
        // (§8.3 "thresholds e modificadores NÃO dependentes de build" —
        // nunca lê Poder do jogador, só o %HP atual do próprio Guardião).
        hp_threshold_pct: { type: Sequelize.INTEGER, allowNull: false },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: true },
        dano_multiplicador: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        defesa_multiplicador: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        enrage: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("temple_boss_status_resistances")) {
      await queryInterface.createTable("temple_boss_status_resistances", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        // Validado contra o catálogo de statusEffectConfig pelo service
        // (nunca livre/texto solto no runtime) — string aqui só pela
        // mesma razão de MonsterStatusEffect.status_key: o catálogo de
        // status já vive em config, não faz sentido um ENUM de banco
        // duplicando a mesma lista.
        status_key: { type: Sequelize.STRING(40), allowNull: false },
        imune: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        resistencia_pct: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("temple_boss_status_resistances", {
        fields: ["id_boss_config", "status_key"],
        type: "unique",
        name: "temple_boss_status_resistances_config_status_unique",
      });
    }

    if (!tabelas.includes("temple_boss_reward_entries")) {
      await queryInterface.createTable("temple_boss_reward_entries", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        reward_kind: { type: Sequelize.ENUM("STACKABLE_ITEM", "EQUIPMENT"), allowNull: false },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        raridade_instancia: { type: Sequelize.STRING(20), allowNull: true },
        weight: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // §10.3 — reward band: elegibilidade por nível pra equipamento
        // de endgame nunca cair pra quem está começando. Null = sem piso/teto.
        nivel_minimo: { type: Sequelize.INTEGER, allowNull: true },
        nivel_maximo: { type: Sequelize.INTEGER, allowNull: true },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: false },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("temple_boss_attempts")) {
      await queryInterface.createTable("temple_boss_attempts", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_events", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        status: { type: Sequelize.ENUM("Ativa", "Vitoria", "Derrota", "Abandonada"), allowNull: false, defaultValue: "Ativa" },
        // §9.3 — snapshot anti-exploit: congelados na criação do attempt,
        // nunca recalculados durante a tentativa (trocar equipamento/
        // Powers em outra aba não altera a luta em andamento).
        player_snapshot: { type: Sequelize.JSONB, allowNull: false },
        boss_snapshot: { type: Sequelize.JSONB, allowNull: false },
        // §11.3 — runtime_state (statusEffects/combatBuffs/escudo/
        // cooldowns/fase atual/vida atual de ambos) persistido a cada
        // turno, pra resync sem duplicar recompensa.
        runtime_state: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        finished_at: { type: Sequelize.DATE, allowNull: true },
        cleared_at: { type: Sequelize.DATE, allowNull: true },
        reward_granted_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // §8.1 "Uma instância por personagem" — só UM attempt Ativa por
      // personagem+evento ao mesmo tempo (histórico de tentativas
      // anteriores continua, só nunca duas EM ANDAMENTO juntas).
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX temple_boss_attempts_uma_ativa_idx
        ON temple_boss_attempts (id_event, character_id)
        WHERE status = 'Ativa';
      `);
    }

    if (!tabelas.includes("temple_boss_reward_grants")) {
      await queryInterface.createTable("temple_boss_reward_grants", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_events", key: "id" },
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
          references: { model: "temple_boss_attempts", key: "id" },
          onDelete: "CASCADE",
        },
        sigilos_concedidos: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.ENUM("Pending", "Granted", "Failed"), allowNull: false, defaultValue: "Pending" },
        detalhes: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // §8.1/§14.2 — primeira vitória paga EXATAMENTE uma vez.
      await queryInterface.addConstraint("temple_boss_reward_grants", {
        fields: ["id_event", "character_id"],
        type: "unique",
        name: "temple_boss_reward_grants_event_character_unique",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("temple_boss_reward_grants");
    await queryInterface.dropTable("temple_boss_attempts");
    await queryInterface.dropTable("temple_boss_reward_entries");
    await queryInterface.dropTable("temple_boss_status_resistances");
    await queryInterface.dropTable("temple_boss_phases");
    await queryInterface.dropTable("temple_boss_configs");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_boss_reward_grants_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_boss_attempts_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_boss_reward_entries_reward_kind";');
  },
};
