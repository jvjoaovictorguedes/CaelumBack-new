"use strict";

// Sistema de Proezas Únicas (Caelum_Proezas_Unicas_Claude.docx) — Fase 1:
// Fundação. Domínio próprio, separado de Achievement/Title (que
// continuam cosméticos) — UniqueFeat é a autoridade mecânica; Achievement/
// Title são só representação pública opcional do feito (§2/§39 da spec).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    // §9 — marca técnica de aquisição restrita no Power em si: nenhuma
    // classe/raça/evolução/loja/drop/seed genérico pode conceder um
    // Power UNIQUE_FEAT (checado no service que concede, não só aqui).
    const colunasPower = await queryInterface.describeTable("Powers");
    if (!colunasPower.acquisition_scope) {
      await queryInterface.addColumn("Powers", "acquisition_scope", {
        type: Sequelize.ENUM("NORMAL", "UNIQUE_FEAT"),
        allowNull: false,
        defaultValue: "NORMAL",
      });
    }

    if (!tabelas.includes("unique_feats")) {
      await queryInterface.createTable("unique_feats", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        // Chave estável (§5.1) — nunca depender de nome exibido; usada
        // pelo registry e pelos triggers pra identificar a Proeza.
        key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(150), allowNull: false },
        descricao_publica: { type: Sequelize.TEXT, allowNull: false },
        // Explica ao ADM a condição real — NUNCA retornado em API
        // pública (ver uniqueFeatPublicService.js).
        descricao_secreta_admin: { type: Sequelize.TEXT, allowNull: false },
        icone_url: { type: Sequelize.STRING(255), allowNull: true },
        // Agrupamento livre pro admin filtrar/organizar (§19.1, §25) —
        // nunca interpretado como regra de negócio.
        categoria: { type: Sequelize.STRING(60), allowNull: true },
        // Chave do uniqueFeatTriggerRegistry — nunca código/SQL/expressão
        // arbitrária vinda do banco (§6/§28 regra 6).
        trigger_key: { type: Sequelize.STRING(60), allowNull: false },
        trigger_config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        id_power_reward: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "Powers", key: "id" },
          onDelete: "RESTRICT",
        },
        id_achievement_reward: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "achievements", key: "id" },
          onDelete: "SET NULL",
        },
        id_title_reward: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "titles", key: "id" },
          onDelete: "SET NULL",
        },
        visibility_before_claim: {
          type: Sequelize.ENUM("HIDDEN", "TEASER"),
          allowNull: false,
          defaultValue: "HIDDEN",
        },
        reveal_after_claim: {
          type: Sequelize.ENUM("FULL", "FLAVOR_ONLY", "REMAIN_SECRET"),
          allowNull: false,
          defaultValue: "FULL",
        },
        announce_global: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        // Desativar impede novos checks; não remove claim existente
        // (§5.1/§21) — nunca DELETE numa Proeza já conquistada.
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addIndex("unique_feats", ["trigger_key", "ativa"], {
        name: "unique_feats_trigger_ativa_idx",
      });
    }

    if (!tabelas.includes("unique_feat_claims")) {
      await queryInterface.createTable("unique_feat_claims", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        // UNIQUE aqui é a garantia física de "um vencedor global por
        // Proeza" (§4/§8) — a última autoridade, mesmo com row lock
        // também em uso no service.
        id_unique_feat: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "unique_feats", key: "id" },
          onDelete: "RESTRICT",
        },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "RESTRICT",
        },
        // Nome histórico no momento do feito (§21) — mudar o nome do
        // personagem depois nunca reescreve este snapshot.
        character_name_snapshot: { type: Sequelize.STRING(100), allowNull: false },
        claimed_at: { type: Sequelize.DATE, allowNull: false },
        trigger_key: { type: Sequelize.STRING(60), allowNull: false },
        // Evidência mínima e sanitizada do evento (§15) — nunca token/IP/
        // e-mail/payload bruto de sessão.
        trigger_snapshot: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        source_event_id: { type: Sequelize.STRING(150), allowNull: true },
        status: {
          type: Sequelize.ENUM("VALID", "REVOKED"),
          allowNull: false,
          defaultValue: "VALID",
        },
        // Só preenchido por reparo administrativo excepcional (§19.4) —
        // nunca usado em fluxo normal de gameplay.
        repair_metadata: { type: Sequelize.JSONB, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addIndex("unique_feat_claims", ["id_personagem"], {
        name: "unique_feat_claims_personagem_idx",
      });
    }

    if (!tabelas.includes("unique_power_effects")) {
      // 1:1 real com Power — id_power é PK e FK ao mesmo tempo (§5.3),
      // nunca um id autoincrement próprio que permitiria duas linhas
      // pro mesmo Power.
      await queryInterface.createTable("unique_power_effects", {
        id_power: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Powers", key: "id" },
          onDelete: "CASCADE",
        },
        // Chave do uniquePowerEffectRegistry — whitelist implementada em
        // código; NUNCA eval de config (§5.3).
        effect_key: { type: Sequelize.STRING(60), allowNull: false },
        config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        allow_pve: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        allow_party: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        allow_guild_boss: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        allow_world_boss: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        // §11 — bloqueados por padrão na V1: Ranked/Torneio nunca
        // permitem Legado, enforcement sempre no backend.
        allow_pvp_casual: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        allow_ranked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        allow_tournament: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    // Permissões do Painel Administrativo (§19.5) — uniquefeats.manage
    // pro CRUD normal (Conteudo+SuperAdmin, mesmo padrão de todo o resto
    // do admin); uniquefeats.repair SÓ SuperAdmin, exigida separadamente
    // pra revogar/transferir um claim já conquistado.
    for (const [chave, descricao, roles] of [
      [
        "uniquefeats.manage",
        "Gerenciar Proezas Únicas, Legados e Triggers (Painel Administrativo)",
        ["Conteudo", "SuperAdmin"],
      ],
      [
        "uniquefeats.repair",
        "Reparo excepcional de Proezas Únicas: revogar ou transferir um claim já conquistado",
        ["SuperAdmin"],
      ],
    ]) {
      const [existente] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave } },
      );
      if (existente.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
           VALUES (:chave, :descricao, now(), now());`,
          { replacements: { chave, descricao } },
        );
      }
      const [[permissao]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_permissions WHERE chave = :chave LIMIT 1;`,
        { replacements: { chave } },
      );
      for (const nomeRole of roles) {
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
    }
  },

  async down(queryInterface) {
    for (const chave of ["uniquefeats.manage", "uniquefeats.repair"]) {
      await queryInterface.sequelize.query(
        `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = :chave);`,
        { replacements: { chave } },
      );
      await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = :chave;`, {
        replacements: { chave },
      });
    }

    await queryInterface.dropTable("unique_power_effects");
    await queryInterface.dropTable("unique_feat_claims");
    await queryInterface.dropTable("unique_feats");
    await queryInterface.removeColumn("Powers", "acquisition_scope");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_unique_power_effects_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_unique_feat_claims_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_unique_feats_reveal_after_claim";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_unique_feats_visibility_before_claim";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Powers_acquisition_scope";');
  },
};
