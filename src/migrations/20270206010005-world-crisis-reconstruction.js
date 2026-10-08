"use strict";
module.exports = {
  async up(q, S) {
    // Postgres cannot use a newly added enum value until this statement commits.
    await q.sequelize.query(
      `ALTER TYPE "enum_world_boss_events_status" ADD VALUE IF NOT EXISTS 'FAILED'`,
    );
    await q.sequelize.transaction(async (transaction) => {
      const o = { transaction },
        id = {
          type: S.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        i = { type: S.INTEGER, allowNull: false },
        t = { type: S.TEXT, allowNull: false },
        j = { type: S.JSONB, allowNull: false, defaultValue: {} },
        timestamps = {
          createdAt: {
            type: S.DATE,
            allowNull: false,
            defaultValue: S.literal("CURRENT_TIMESTAMP"),
          },
          updatedAt: {
            type: S.DATE,
            allowNull: false,
            defaultValue: S.literal("CURRENT_TIMESTAMP"),
          },
        };
      const fk = (table, nullable = false) => ({
        type: S.INTEGER,
        allowNull: nullable,
        references: { model: table, key: "id" },
        onDelete: "RESTRICT",
      });
      const tables = {
        world_crisis_configs: {
          key: { type: S.STRING(80), unique: true, allowNull: false },
          nome: t,
          descricao: { type: S.TEXT },
          ativo: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
          structure: j,
        },
        world_crisis_events: {
          crisis_config_id: fk("world_crisis_configs", true),
          source_id: fk("world_boss_events"),
          status: { type: S.STRING(20), allowNull: false },
          current_stage_key: t,
          config_snapshot: j,
          started_at: { type: S.DATE, allowNull: false },
          completed_at: { type: S.DATE },
          rankings_frozen_at: { type: S.DATE },
          contributions_paused: {
            type: S.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          runtime_state: j,
          final_rankings: j,
          rewards_done: {
            type: S.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
        },
        world_crisis_progress: {
          event_id: fk("world_crisis_events"),
          stage_key: t,
          requirement_key: t,
          current_progress: {
            type: S.BIGINT,
            allowNull: false,
            defaultValue: 0,
          },
          target_progress: { type: S.BIGINT, allowNull: false },
          completed_at: { type: S.DATE },
        },
        world_crisis_contributions: {
          event_id: fk("world_crisis_events"),
          stage_key: t,
          requirement_key: t,
          character_id: fk("Characters"),
          guild_id_at_contribution: { type: S.INTEGER },
          ranking_guild_id: { type: S.INTEGER },
          item_id: fk("Items"),
          quantity: i,
          progress_units: { type: S.BIGINT, allowNull: false },
          ranking_points: { type: S.BIGINT, allowNull: false },
          request_id: { type: S.STRING(100), allowNull: false },
          response: j,
        },
        world_crisis_participation: {
          event_id: fk("world_crisis_events"),
          character_id: fk("Characters"),
          ranking_guild_id: { type: S.INTEGER },
        },
        world_crisis_guild_snapshots: {
          event_id: fk("world_crisis_events"),
          guild_id: i,
          guild_name_snapshot: t,
          member_count_snapshot: i,
          existed_at_start: { type: S.BOOLEAN, allowNull: false },
        },
        world_crisis_announcements: {
          event_id: fk("world_crisis_events"),
          seq: i,
          type: t,
          title: t,
          message: t,
          payload: j,
        },
        world_crisis_ui_state: {
          event_id: fk("world_crisis_events"),
          character_id: fk("Characters"),
          last_seen_announcement_seq: { ...i, defaultValue: 0 },
        },
        world_crisis_reward_grants: {
          event_id: fk("world_crisis_events"),
          recipient_type: t,
          recipient_id: i,
          tier_key: t,
          status: {
            type: S.STRING(20),
            allowNull: false,
            defaultValue: "Pending",
          },
          payload_snapshot: { ...j, defaultValue: [] },
          granted_at: { type: S.DATE },
        },
      };
      for (const [name, fields] of Object.entries(tables))
        await q.createTable(name, { id, ...fields, ...timestamps }, o);
      for (const [table, fields] of [
        ["world_crisis_events", ["source_id"]],
        ["world_crisis_progress", ["event_id", "stage_key", "requirement_key"]],
        [
          "world_crisis_contributions",
          ["event_id", "character_id", "request_id"],
        ],
        ["world_crisis_participation", ["event_id", "character_id"]],
        ["world_crisis_guild_snapshots", ["event_id", "guild_id"]],
        ["world_crisis_announcements", ["event_id", "seq"]],
        ["world_crisis_ui_state", ["event_id", "character_id"]],
        [
          "world_crisis_reward_grants",
          ["event_id", "recipient_type", "recipient_id", "tier_key"],
        ],
      ])
        await q.addIndex(table, fields, { ...o, unique: true });
      await q.sequelize.query(
        "CREATE UNIQUE INDEX world_crisis_one_active ON world_crisis_events (status) WHERE status='ACTIVE'",
        o,
      );
      await q.addIndex(
        "world_crisis_contributions",
        ["event_id", "ranking_guild_id"],
        o,
      );
      await q.addColumn(
        "world_boss_configs",
        "combat_duration_seconds",
        { type: S.INTEGER, allowNull: true },
        o,
      );
      await q.addColumn(
        "world_boss_configs",
        "id_failure_crisis_config",
        fk("world_crisis_configs", true),
        o,
      );
      for (const col of ["combat_expires_at", "failed_at"])
        await q.addColumn("world_boss_events", col, { type: S.DATE }, o);
      await q.addColumn(
        "world_boss_events",
        "failure_reason",
        { type: S.STRING(30) },
        o,
      );
      await q.sequelize.query(
        `INSERT INTO admin_permissions (chave,descricao,"createdAt","updatedAt") VALUES ('worldcrisis.manage','Gerenciar crises mundiais e reconstrução',NOW(),NOW()) ON CONFLICT (chave) DO NOTHING`,
        o,
      );
      await q.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role,id_permission,"createdAt","updatedAt") SELECT r.id,p.id,NOW(),NOW() FROM admin_roles r CROSS JOIN admin_permissions p WHERE r.nome='SuperAdmin' AND p.chave='worldcrisis.manage' ON CONFLICT DO NOTHING`,
        o,
      );
      for (const [key, value] of [
        ["worldcrisis.enabled", false],
        ["worldcrisis.pause_worldboss_during_active_crisis", true],
        ["worldcrisis.max_penalty_pct", 50],
      ])
        await q.sequelize.query(
          `INSERT INTO game_settings (chave,valor,tipo,editavel_admin,"createdAt","updatedAt") VALUES (:key,CAST(:value AS jsonb),'json',true,NOW(),NOW()) ON CONFLICT (chave) DO NOTHING`,
          { ...o, replacements: { key, value: JSON.stringify(value) } },
        );
    });
  },
  async down() {
    throw new Error(
      "Forward-only: preserve crisis contributions, reward grants and FAILED history. Disable worldcrisis.enabled and unlink future boss consequences for operational rollback.",
    );
  },
};
