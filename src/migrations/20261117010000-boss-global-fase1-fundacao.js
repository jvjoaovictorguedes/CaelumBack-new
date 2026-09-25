"use strict";

// Boss Global / Ameaça Mundial (Caelum_Boss_Global.docx) — Fase 1:
// Fundação. Domínio SEPARADO de GuildBoss (escopo de servidor inteiro,
// não de guilda) — tabelas próprias, nunca reaproveita
// guild_boss_attempts/guild_boss_contributions.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("world_boss_configs")) {
      await queryInterface.createTable("world_boss_configs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(150), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        lore: { type: Sequelize.TEXT, allowNull: true },
        imagem_url: { type: Sequelize.STRING, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        // §20 — só WorldBossConfig ativo participa da seleção; peso
        // controla a chance relativa entre múltiplos configs ativos.
        peso_selecao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        vida_base: { type: Sequelize.BIGINT, allowNull: false },
        defesa: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        mensagem_descoberta: { type: Sequelize.TEXT, allowNull: false },
        mensagem_convocacao: { type: Sequelize.TEXT, allowNull: false },
        mensagem_fase_final: { type: Sequelize.TEXT, allowNull: true },
        mensagem_derrota: { type: Sequelize.TEXT, allowNull: true },
        id_item_golpe_final: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        gold_descoberta: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        gold_participacao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        xp_participacao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // §16.2 — critério mínimo pra recompensa de participação (dano
        // absoluto). Null = qualquer contribuição > 0 já qualifica.
        min_dano_participacao: { type: Sequelize.BIGINT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("world_boss_config_zones")) {
      await queryInterface.createTable("world_boss_config_zones", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_world_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        id_zone: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "AdventureZones", key: "id" },
          onDelete: "CASCADE",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("world_boss_config_zones", {
        fields: ["id_world_boss_config", "id_zone"],
        type: "unique",
        name: "world_boss_config_zones_config_zone_unique",
      });
    }

    if (!tabelas.includes("world_boss_phases")) {
      await queryInterface.createTable("world_boss_phases", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_world_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_boss_configs", key: "id" },
          onDelete: "CASCADE",
        },
        ordem: { type: Sequelize.INTEGER, allowNull: false },
        nome_fase: { type: Sequelize.STRING(100), allowNull: false },
        // Fase ativa quando hp_current/hp_max*100 <= hp_percentual_max
        // (§11) — faixas não se sobrepõem, validado no service.
        hp_percentual_max: { type: Sequelize.INTEGER, allowNull: false },
        modificador_dano_percentual: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        texto_alerta: { type: Sequelize.TEXT, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    if (!tabelas.includes("world_boss_events")) {
      await queryInterface.createTable("world_boss_events", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_world_boss_config: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_boss_configs", key: "id" },
          onDelete: "RESTRICT",
        },
        status: {
          type: Sequelize.ENUM("COOLDOWN", "DORMANT", "DISCOVERED", "ACTIVE", "DEFEATED", "CANCELLED"),
          allowNull: false,
        },
        hp_max: { type: Sequelize.BIGINT, allowNull: false },
        hp_current: { type: Sequelize.BIGINT, allowNull: false },
        // §18/§19 — snapshot congelado no início do ciclo (nome, arte,
        // mensagens, fases, defesa, item de Golpe Final, cooldown_hours).
        // Editar o catálogo depois NUNCA muda um evento já em andamento.
        config_snapshot: { type: Sequelize.JSONB, allowNull: false },
        discoverer_character_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
          onDelete: "SET NULL",
        },
        discovery_zone_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "AdventureZones", key: "id" },
          onDelete: "SET NULL",
        },
        discovered_at: { type: Sequelize.DATE, allowNull: true },
        auto_awaken_at: { type: Sequelize.DATE, allowNull: true },
        activated_at: { type: Sequelize.DATE, allowNull: true },
        final_blow_character_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Characters", key: "id" },
          onDelete: "SET NULL",
        },
        defeated_at: { type: Sequelize.DATE, allowNull: true },
        next_eligible_at: { type: Sequelize.DATE, allowNull: true },
        // §5.2 — nunca devolvido ao jogador (status público só expõe
        // ACTIVE/HP/fase). BIGINT porque o volume real de Aventuras pode
        // passar de milhões ao longo do tempo.
        discovery_threshold: { type: Sequelize.BIGINT, allowNull: true },
        discovery_progress: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        participation_rewards_status: {
          type: Sequelize.ENUM("Pending", "Processing", "Done"),
          allowNull: false,
          defaultValue: "Pending",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });

      // §6 — no máximo UM evento aberto (Dormant/Discovered/Active) ao
      // mesmo tempo, garantido pelo BANCO (índice único parcial), nunca
      // só por um if no service.
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX world_boss_events_um_aberto_idx
        ON world_boss_events ((1))
        WHERE status IN ('DORMANT', 'DISCOVERED', 'ACTIVE');
      `);
      await queryInterface.addIndex("world_boss_events", ["status", "next_eligible_at"], {
        name: "world_boss_events_status_next_eligible_idx",
      });
    }

    if (!tabelas.includes("world_boss_contributions")) {
      await queryInterface.createTable("world_boss_contributions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_boss_events", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        damage_total: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
        attacks_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        attempts_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        last_action_seq: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        first_joined_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        last_action_at: { type: Sequelize.DATE, allowNull: true },
      });
      await queryInterface.addConstraint("world_boss_contributions", {
        fields: ["event_id", "character_id"],
        type: "unique",
        name: "world_boss_contributions_event_character_unique",
      });
      await queryInterface.addIndex("world_boss_contributions", ["event_id", "damage_total"], {
        name: "world_boss_contributions_ranking_idx",
      });
    }

    if (!tabelas.includes("world_boss_combat_sessions")) {
      await queryInterface.createTable("world_boss_combat_sessions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_boss_events", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        status: { type: Sequelize.ENUM("Ativo", "Encerrada"), allowNull: false, defaultValue: "Ativo" },
        action_seq: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Só o que é EXCLUSIVO desta luta (§9 tabela "Estado individual")
        // — HP/Mana reais continuam em Character.vida_atual/mana_atual,
        // igual ao resto do combate; aqui só status effects/cooldowns/
        // turno desta sessão específica.
        state: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      // §13/§31 — uma sessão ATIVA por personagem, garantido pelo banco
      // (índice único parcial) — nunca duas abas atacando ao mesmo tempo.
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX world_boss_combat_sessions_um_ativo_idx
        ON world_boss_combat_sessions (character_id)
        WHERE status = 'Ativo';
      `);
    }

    if (!tabelas.includes("world_boss_reward_grants")) {
      await queryInterface.createTable("world_boss_reward_grants", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        event_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_boss_events", key: "id" },
          onDelete: "CASCADE",
        },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        reward_kind: {
          type: Sequelize.ENUM("DISCOVERY", "PARTICIPATION", "FINAL_BLOW", "OPTIONAL_TOP"),
          allowNull: false,
        },
        payload_snapshot: { type: Sequelize.JSONB, allowNull: true },
        status: { type: Sequelize.ENUM("Pending", "Granted", "Failed"), allowNull: false, defaultValue: "Pending" },
        granted_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("world_boss_reward_grants", {
        fields: ["event_id", "character_id", "reward_kind"],
        type: "unique",
        name: "world_boss_reward_grants_event_character_kind_unique",
      });
    }

    if (!tabelas.includes("world_boss_activity_metrics")) {
      await queryInterface.createTable("world_boss_activity_metrics", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        // Truncado pra hora — telemetria agregada de encontros
        // elegíveis (§5.1/§5.2), nunca por encontro individual.
        window_start: { type: Sequelize.DATE, allowNull: false, unique: true },
        encontros_elegiveis: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      });
    }

    // Permissões worldboss.manage (Conteúdo) — events.manage já existe
    // (Fase 1 do Painel Admin) e cobre a operação do ciclo atual (§26).
    const [existente] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'worldboss.manage' LIMIT 1;`,
    );
    if (existente.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('worldboss.manage', 'Criar/editar/desativar catálogo de Ameaças Mundiais (Boss Global)', now(), now());`,
      );
    }
    const [[permissao]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'worldboss.manage' LIMIT 1;`,
    );
    for (const nomeRole of ["Conteudo", "SuperAdmin"]) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role || !permissao) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
         VALUES (:idRole, :idPermission, now(), now())
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: role.id, idPermission: permissao.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'worldboss.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'worldboss.manage';`);

    await queryInterface.dropTable("world_boss_activity_metrics");
    await queryInterface.dropTable("world_boss_reward_grants");
    await queryInterface.dropTable("world_boss_combat_sessions");
    await queryInterface.dropTable("world_boss_contributions");
    await queryInterface.dropTable("world_boss_events");
    await queryInterface.dropTable("world_boss_phases");
    await queryInterface.dropTable("world_boss_config_zones");
    await queryInterface.dropTable("world_boss_configs");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_world_boss_reward_grants_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_world_boss_reward_grants_reward_kind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_world_boss_combat_sessions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_world_boss_events_participation_rewards_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_world_boss_events_status";');
  },
};
