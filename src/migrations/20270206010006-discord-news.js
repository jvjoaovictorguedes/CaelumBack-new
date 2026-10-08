"use strict";
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const o = { transaction };
      const id = {
        type: S.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      };
      const stamps = {
        createdAt: {
          type: S.DATE,
          allowNull: false,
          defaultValue: S.fn("NOW"),
        },
        updatedAt: {
          type: S.DATE,
          allowNull: false,
          defaultValue: S.fn("NOW"),
        },
      };
      await q.createTable(
        "discord_news_state",
        {
          id: { type: S.INTEGER, primaryKey: true },
          enabled: { type: S.BOOLEAN, allowNull: false, defaultValue: false },
          auto_patch_notes: {
            type: S.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          capture_since: {
            type: S.DATE,
            allowNull: false,
            defaultValue: S.fn("NOW"),
          },
          ...stamps,
        },
        o,
      );
      await q.sequelize.query(
        "INSERT INTO discord_news_state (id) VALUES (1)",
        o,
      );
      await q.createTable(
        "discord_news_changes",
        {
          id,
          audit_id: {
            type: S.INTEGER,
            allowNull: false,
            unique: true,
            references: { model: "admin_action_logs", key: "id" },
          },
          entity: { type: S.STRING(80), allowNull: false },
          entity_id: { type: S.INTEGER, allowNull: false },
          name: { type: S.STRING(200), allowNull: false },
          diff: { type: S.JSONB, allowNull: false },
          release_env: { type: S.STRING(20), allowNull: false },
          status: {
            type: S.STRING(20),
            allowNull: false,
            defaultValue: "Pending",
          },
          approved_at: { type: S.DATE },
          ...stamps,
        },
        o,
      );
      await q.createTable(
        "discord_news_deliveries",
        {
          id,
          source_key: { type: S.STRING(100), allowNull: false, unique: true },
          kind: { type: S.STRING(20), allowNull: false },
          source_id: { type: S.INTEGER, allowNull: false },
          payload: { type: S.JSONB, allowNull: false },
          status: {
            type: S.STRING(20),
            allowNull: false,
            defaultValue: "Pending",
          },
          available_at: {
            type: S.DATE,
            allowNull: false,
            defaultValue: S.fn("NOW"),
          },
          attempts: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
          message_id: { type: S.STRING(30) },
          channel_id: { type: S.STRING(30) },
          last_error: { type: S.STRING(200) },
          ...stamps,
        },
        o,
      );
      await q.addIndex(
        "discord_news_deliveries",
        ["status", "available_at"],
        o,
      );
      await q.addIndex(
        "discord_news_changes",
        ["status", "entity", "entity_id"],
        o,
      );
      await q.createTable(
        "discord_news_interactions",
        {
          id: { type: S.STRING(30), primaryKey: true },
          user_id: { type: S.STRING(30), allowNull: false },
          createdAt: {
            type: S.DATE,
            allowNull: false,
            defaultValue: S.fn("NOW"),
          },
        },
        o,
      );
      await q.addIndex(
        "discord_news_interactions",
        ["user_id", "createdAt"],
        o,
      );
      await q.sequelize.query(
        `INSERT INTO admin_permissions (chave,descricao,"createdAt","updatedAt") VALUES ('discordnews.manage','Revisar notícias e integração Discord',NOW(),NOW()) ON CONFLICT (chave) DO NOTHING`,
        o,
      );
      await q.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role,id_permission,"createdAt","updatedAt") SELECT r.id,p.id,NOW(),NOW() FROM admin_roles r CROSS JOIN admin_permissions p WHERE r.nome='SuperAdmin' AND p.chave='discordnews.manage' ON CONFLICT DO NOTHING`,
        o,
      );
    });
  },
  async down() {
    throw new Error(
      "Forward-only: disable discord_news_state.enabled and DISCORD_NEWS_ENABLED; preserve publication history.",
    );
  },
};
