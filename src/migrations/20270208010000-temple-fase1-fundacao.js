"use strict";

// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) —
// Fase 1: Fundação. Domínio SEPARADO de WorldBoss/GuildBoss (evento
// próprio, moeda própria) — tabelas próprias, nunca reaproveita
// world_boss_events/guild_boss_attempts. Mesmo estilo de
// 20261117010000-boss-global-fase1-fundacao.js.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    // §5.1 — Sigilo Celestial: primeiro Item Currencia real do catálogo
    // (tipo_item Currencia já existia no enum, nunca usado). Permanente,
    // não negociável, não comprável — negociavel_mercado/disponivel_loja
    // explicitamente false, nunca só herdado do default da coluna.
    const [existenteSigilo] = await queryInterface.sequelize.query(
      `SELECT id FROM "Items" WHERE nome = 'Sigilo Celestial' LIMIT 1;`,
    );
    if (existenteSigilo.length === 0) {
      await queryInterface.sequelize.query(`
        INSERT INTO "Items"
          (nome, descricao, tipo_item, raridade, valor_compra, valor_venda, peso, disponivel_loja, negociavel_mercado, ativo, "createdAt", "updatedAt")
        VALUES
          ('Sigilo Celestial', 'Moeda do Templo do Véu Celestial — formada apenas quando as Provações de uma Convergência são cumpridas. Permanece no inventário entre Convergências; nunca é vendida, comprada ou negociada.', 'Currencia', 'Epico', 0, 0, 0, false, false, true, now(), now());
      `);
    }

    // §8.2 — AdventureMonster.temple_exclusive: monstro-base do
    // Guardião nunca entra em zonas/emboscadas/rotações normais.
    // Validação (não pode ter AdventureZoneMonster ativo,
    // disponivel_emboscada deve ser false) fica no service de Admin,
    // nunca só na coluna — mesmo princípio de disponivel_emboscada.
    const colunasMonstro = await queryInterface.describeTable("AdventureMonsters");
    if (!colunasMonstro.temple_exclusive) {
      await queryInterface.addColumn("AdventureMonsters", "temple_exclusive", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!tabelas.includes("temple_events")) {
      await queryInterface.createTable("temple_events", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        // Identidade (§12.1) — key estável pro Admin referenciar o
        // evento fora do id numérico (duplicar/templates futuros).
        key: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(150), allowNull: false },
        lore: { type: Sequelize.TEXT, allowNull: true },
        teaser: { type: Sequelize.TEXT, allowNull: true },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        status: {
          type: Sequelize.ENUM("DRAFT", "SCHEDULED", "ACTIVE", "RELICARY_ONLY", "ENDED", "CANCELLED"),
          allowNull: false,
          defaultValue: "DRAFT",
        },
        // §3.2 — datas do ciclo; não é janela móvel por jogador.
        starts_at: { type: Sequelize.DATE, allowNull: true },
        missions_end_at: { type: Sequelize.DATE, allowNull: true },
        relicary_end_at: { type: Sequelize.DATE, allowNull: true },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        cancelled_at: { type: Sequelize.DATE, allowNull: true },
        cancel_reason: { type: Sequelize.TEXT, allowNull: true },
        id_currency_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        // §12.2 — freeze/config_snapshot: congelado ao ativar (moeda/
        // custos, missões, pool/odds/pity, Guardião, abilities/
        // passivas, fases, resistências, scaling, drops). Runtime do
        // evento lê SÓ o snapshot, nunca o catálogo editável — mesmo
        // princípio de WorldBossEvent.config_snapshot. Null até ativar.
        config_snapshot: { type: Sequelize.JSONB, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });

      // §12.3 — no máximo UM evento ACTIVE/RELICARY_ONLY ao mesmo
      // tempo, garantido pelo BANCO (índice único parcial), nunca só
      // por um if no service — mesmo padrão de
      // world_boss_events_um_aberto_idx.
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX temple_events_um_aberto_idx
        ON temple_events ((1))
        WHERE status IN ('ACTIVE', 'RELICARY_ONLY');
      `);
      await queryInterface.addIndex("temple_events", ["status", "starts_at"], {
        name: "temple_events_status_starts_at_idx",
      });
    }

    if (!tabelas.includes("temple_missions")) {
      await queryInterface.createTable("temple_missions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_events", key: "id" },
          onDelete: "CASCADE",
        },
        // §4.1 — key estável dentro do evento (ex.: "rito_aplicar_burn",
        // "provacao_vencer_zonas"), nunca o texto de nome como
        // identificador (§4.2).
        key: { type: Sequelize.STRING(80), allowNull: false },
        categoria: { type: Sequelize.ENUM("RITO_DIARIO", "PROVACAO_PRINCIPAL"), allowNull: false },
        objective_type: {
          type: Sequelize.ENUM(
            "WIN_ADVENTURE_NO_CONSUMABLE",
            "APPLY_STATUS",
            "DEFEAT_AFFECTED_BY_STATUS",
            "WIN_DISTINCT_ZONES",
            "FINAL_BLOW_WITH_POWER",
            "CRAFT_RARITY_OR_HIGHER",
            "COMPLETE_EXPEDITIONS",
            "PARTY_ADVENTURE_WINS",
            "DELIVER_ITEM",
            "CLEANSE_STATUS",
          ),
          allowNull: false,
        },
        // Config tipada do objetivo (ex.: { statusKey: "BURN" },
        // { itemId, quantidade } pra DELIVER_ITEM) — validada por
        // objective_type em templeMissionAdminService, nunca config
        // livre sem shape.
        objective_config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        meta: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        reward_sigils: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("temple_missions", {
        fields: ["id_event", "key"],
        type: "unique",
        name: "temple_missions_event_key_unique",
      });
    }

    if (!tabelas.includes("character_temple_mission_progress")) {
      await queryInterface.createTable("character_temple_mission_progress", {
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
        mission_key: { type: Sequelize.STRING(80), allowNull: false },
        // §4.1 — Rito Diário renova por ciclo global diário durante
        // ACTIVE; Provação Principal nunca reseta (§14.2). cycle_key
        // carrega a data UTC ("2026-10-08") pro Rito, e uma constante
        // fixa ("once") pra Provação Principal — nunca null, pra a
        // unique constraint cobrir os dois casos uniformemente.
        cycle_key: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "once" },
        progresso_atual: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Sets/campos server-owned (§4.2, ex.: ids de zonas distintas já
        // vencidas pra WIN_DISTINCT_ZONES) — nunca aceito como payload
        // livre do cliente; só templeObjectiveService escreve aqui.
        state_json: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
        completed_at: { type: Sequelize.DATE, allowNull: true },
        claimed_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("character_temple_mission_progress", {
        fields: ["id_event", "character_id", "mission_key", "cycle_key"],
        type: "unique",
        name: "char_temple_mission_progress_unique",
      });
    }

    if (!tabelas.includes("character_temple_progress")) {
      await queryInterface.createTable("character_temple_progress", {
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
        // §4.4 — registrado UMA única vez quando todas as
        // PROVACAO_PRINCIPAL daquele evento forem concluídas.
        boss_unlocked_at: { type: Sequelize.DATE, allowNull: true },
        boss_cleared_at: { type: Sequelize.DATE, allowNull: true },
        reward_granted_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("character_temple_progress", {
        fields: ["id_event", "character_id"],
        type: "unique",
        name: "character_temple_progress_event_character_unique",
      });
    }

    // Permissão temple.manage (Conteúdo) — mesmo padrão de
    // worldboss.manage (20261117010000).
    const [existentePermissao] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'temple.manage' LIMIT 1;`,
    );
    if (existentePermissao.length === 0) {
      await queryInterface.sequelize.query(
        `INSERT INTO admin_permissions (chave, descricao, "createdAt", "updatedAt")
         VALUES ('temple.manage', 'Criar/editar/agendar/cancelar Convergências do Templo do Véu Celestial', now(), now());`,
      );
    }
    const [[permissaoTemplo]] = await queryInterface.sequelize.query(
      `SELECT id FROM admin_permissions WHERE chave = 'temple.manage' LIMIT 1;`,
    );
    for (const nomeRole of ["Conteudo", "SuperAdmin"]) {
      const [[role]] = await queryInterface.sequelize.query(
        `SELECT id FROM admin_roles WHERE nome = :nome LIMIT 1;`,
        { replacements: { nome: nomeRole } },
      );
      if (!role || !permissaoTemplo) continue;
      await queryInterface.sequelize.query(
        `INSERT INTO admin_role_permissions (id_role, id_permission, "createdAt", "updatedAt")
         VALUES (:idRole, :idPermission, now(), now())
         ON CONFLICT DO NOTHING;`,
        { replacements: { idRole: role.id, idPermission: permissaoTemplo.id } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM admin_role_permissions WHERE id_permission = (SELECT id FROM admin_permissions WHERE chave = 'temple.manage');`,
    );
    await queryInterface.sequelize.query(`DELETE FROM admin_permissions WHERE chave = 'temple.manage';`);

    await queryInterface.dropTable("character_temple_progress");
    await queryInterface.dropTable("character_temple_mission_progress");
    await queryInterface.dropTable("temple_missions");
    await queryInterface.dropTable("temple_events");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_missions_objective_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_missions_categoria";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_events_status";');

    await queryInterface.removeColumn("AdventureMonsters", "temple_exclusive");

    await queryInterface.sequelize.query(`DELETE FROM "Items" WHERE nome = 'Sigilo Celestial';`);
  },
};
