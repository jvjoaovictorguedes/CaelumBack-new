"use strict";
module.exports = {
  async up(q, S) {
    await q.sequelize.transaction(async (transaction) => {
      const stamp = { type: S.DATE, allowNull: false };
      const owner = {
        type: S.INTEGER,
        allowNull: false,
        references: { model: "Characters", key: "id" },
        onDelete: "CASCADE",
      };
      await q.createTable(
        "automation_risk_states",
        {
          id_personagem: { ...owner, primaryKey: true },
          score: { type: S.FLOAT, allowNull: false, defaultValue: 0 },
          status: {
            type: S.STRING(40),
            allowNull: false,
            defaultValue: "NORMAL",
          },
          signal_families: {
            type: S.JSONB,
            allowNull: false,
            defaultValue: [],
          },
          last_signal_at: S.DATE,
          last_decay_at: S.DATE,
          verified_until: S.DATE,
          restricted_until: S.DATE,
          exempt_until: S.DATE,
          version: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
          createdAt: stamp,
          updatedAt: stamp,
        },
        { transaction },
      );
      await q.createTable(
        "automation_events",
        {
          id: { type: S.INTEGER, autoIncrement: true, primaryKey: true },
          id_personagem: owner,
          event_type: { type: S.STRING(40), allowNull: false },
          action_type: S.STRING(80),
          risk_delta: S.FLOAT,
          metadata: { type: S.JSONB, allowNull: false, defaultValue: {} },
          createdAt: stamp,
          updatedAt: stamp,
        },
        { transaction },
      );
      await q.createTable(
        "automation_challenges",
        {
          id: { type: S.UUID, primaryKey: true },
          id_personagem: owner,
          provider: {
            type: S.STRING(30),
            allowNull: false,
            defaultValue: "TURNSTILE",
          },
          status: {
            type: S.STRING(30),
            allowNull: false,
            defaultValue: "PENDING",
          },
          expires_at: stamp,
          verified_at: S.DATE,
          attempts: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
          createdAt: stamp,
          updatedAt: stamp,
        },
        { transaction },
      );
      await q.createTable(
        "automation_action_receipts",
        {
          id_personagem: { ...owner, primaryKey: true },
          action_id: { type: S.UUID, primaryKey: true },
          session_id: {
            type: S.INTEGER,
            allowNull: false,
            references: { model: "fishing_sessions", key: "id" },
            onDelete: "CASCADE",
          },
          state_version: { type: S.INTEGER, allowNull: false },
          result: { type: S.JSONB, allowNull: false },
          createdAt: stamp,
          updatedAt: stamp,
        },
        { transaction },
      );
      await q.addIndex("automation_events", ["id_personagem", "createdAt"], {
        transaction,
      });
      await q.addIndex("automation_events", ["createdAt"], { transaction });
      await q.addIndex("automation_challenges", ["id_personagem", "status"], {
        transaction,
      });
      await q.addIndex("automation_challenges", ["createdAt"], { transaction });
      for (const [key, description] of [
        ["anti_automation.view", "Consultar anti-automação"],
        ["anti_automation.manage", "Revisar risco e configurar anti-automação"],
      ]) {
        await q.sequelize.query(
          'INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt") VALUES (:key, :description, NOW(), NOW()) ON CONFLICT (chave) DO NOTHING',
          { replacements: { key, description }, transaction },
        );
        await q.sequelize.query(
          'INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt") SELECT r.id, p.id, NOW(), NOW() FROM admin_roles r CROSS JOIN admin_permissions p WHERE r.nome = \'SuperAdmin\' AND p.chave = :key ON CONFLICT DO NOTHING',
          { replacements: { key }, transaction },
        );
      }
    });
  },
  async down(q) {
    await q.sequelize.transaction(async (transaction) => {
      await q.sequelize.query(
        "DELETE FROM admin_role_permissions WHERE id_permission IN (SELECT id FROM admin_permissions WHERE chave IN ('anti_automation.view','anti_automation.manage'))",
        { transaction },
      );
      await q.sequelize.query(
        "DELETE FROM admin_permissions WHERE chave IN ('anti_automation.view','anti_automation.manage')",
        { transaction },
      );
      for (const name of [
        "automation_action_receipts",
        "automation_challenges",
        "automation_events",
        "automation_risk_states",
      ])
        await q.dropTable(name, { transaction });
    });
  },
};
