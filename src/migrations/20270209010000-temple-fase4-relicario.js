"use strict";

// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 4: Relicário dos Ecos (§6/§7/§11.1). Catálogo editável
// (TempleRewardPool/TempleRewardEntry) fica fora do config_snapshot até
// a Convergência ativar (templeLifecycleService.montarSnapshot passa a
// congelar "relicary" nesta Fase) — igual TempleMission na Fase 1.
// CharacterTempleDrawState é GLOBAL por personagem (sem id_event):
// §7.1 recomenda que o pity principal persista ENTRE Convergências, não
// resete a cada evento novo. TempleDrawBatch existe só pra idempotência
// (client_request_id) — TempleDrawHistory guarda o resultado de cada
// draw individual dentro do lote de 1x/10x.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("temple_reward_pools")) {
      await queryInterface.createTable("temple_reward_pools", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_event: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_events", key: "id" },
          onDelete: "CASCADE",
        },
        nome: { type: Sequelize.STRING(150), allowNull: false },
        // §6.1 — custo em Sigilos de UM draw; 10x cobra exatamente
        // 10x isso (spec não menciona desconto de pacote).
        custo_sigilos_draw: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // §7.1 — garantias configuráveis ("Raro+ em N draws",
        // "Featured/Principal em M draws"). Null = sem garantia daquele
        // tipo neste pool.
        pity_raro_mais_garantia: { type: Sequelize.INTEGER, allowNull: true },
        pity_featured_garantia: { type: Sequelize.INTEGER, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addIndex("temple_reward_pools", ["id_event", "ativo"], {
        name: "temple_reward_pools_event_ativo_idx",
      });
    }

    if (!tabelas.includes("temple_reward_entries")) {
      await queryInterface.createTable("temple_reward_entries", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_pool: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_reward_pools", key: "id" },
          onDelete: "CASCADE",
        },
        // Estável dentro do pool (fallback_key referencia isto) — nunca
        // o id numérico, que pode mudar se o Admin recriar a entry.
        key: { type: Sequelize.STRING(80), allowNull: false },
        reward_kind: { type: Sequelize.ENUM("STACKABLE_ITEM", "EQUIPMENT"), allowNull: false },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        // §6.2 — stackable usa quantidade; equipamento sempre gera 1
        // instância (quantidade ignorada pelo service nesse caso).
        quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // Raridade fixa da instância quando reward_kind = EQUIPMENT —
        // decidida pelo Admin na entry, nunca sorteada de novo aqui
        // (equipmentInstanceService.create exige raridade explícita).
        raridade_instancia: { type: Sequelize.STRING(20), allowNull: true },
        // Peso no sorteio ponderado normal (fora de garantia de pity).
        weight: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // §7.1 — conta pra qual(is) garantia(s) de pity esta entry serve.
        eh_raro_mais: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        eh_featured: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // §7.2 — recompensa única (Power/Título/conhecimento futuro):
        // se o personagem já possui, sai da lista elegível e usa
        // fallback_key no lugar. V1 prefere Item pra reduzir branches,
        // mas a coluna existe pra quando um pool referenciar algo único.
        eh_unico: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        fallback_key: { type: Sequelize.STRING(80), allowNull: true },
        nome_exibicao: { type: Sequelize.STRING(150), allowNull: false },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("temple_reward_entries", {
        fields: ["id_pool", "key"],
        type: "unique",
        name: "temple_reward_entries_pool_key_unique",
      });
    }

    // §7.1 — GLOBAL por personagem (sem id_event de propósito): o pity
    // principal persiste entre Convergências, nunca reseta sozinho
    // quando uma Convergência nova ativa.
    if (!tabelas.includes("character_temple_draw_state")) {
      await queryInterface.createTable("character_temple_draw_state", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        character_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        draws_desde_raro_mais: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        draws_desde_featured: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_draws: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        last_draw_at: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
    }

    // §14.1/14.2 — idempotência de retry: um client_request_id só é
    // processado uma vez por personagem (UNIQUE). O lote 1x/10x inteiro
    // fica amarrado aqui; TempleDrawHistory guarda cada draw individual
    // do lote (draw_seq) pra pity/duplicate corretos e auditoria.
    if (!tabelas.includes("temple_draw_batches")) {
      await queryInterface.createTable("temple_draw_batches", {
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
        client_request_id: { type: Sequelize.STRING(120), allowNull: false },
        quantidade: { type: Sequelize.INTEGER, allowNull: false },
        custo_total: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addConstraint("temple_draw_batches", {
        fields: ["character_id", "client_request_id"],
        type: "unique",
        name: "temple_draw_batches_character_request_unique",
      });
    }

    if (!tabelas.includes("temple_draw_history")) {
      await queryInterface.createTable("temple_draw_history", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_batch: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "temple_draw_batches", key: "id" },
          onDelete: "CASCADE",
        },
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
        // Sequência vitalícia do personagem no Relicário (snapshot de
        // CharacterTempleDrawState.total_draws no momento do draw) —
        // nunca reseta por evento, pra o histórico ficar ordenável
        // globalmente mesmo cruzando Convergências.
        draw_seq: { type: Sequelize.INTEGER, allowNull: false },
        entry_key: { type: Sequelize.STRING(80), allowNull: false },
        reward_kind: { type: Sequelize.ENUM("STACKABLE_ITEM", "EQUIPMENT"), allowNull: false },
        id_item: { type: Sequelize.INTEGER, allowNull: false },
        nome_item_snapshot: { type: Sequelize.STRING(150), allowNull: false },
        quantidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        raridade_snapshot: { type: Sequelize.STRING(20), allowNull: true },
        // §7.2 — quando a entry sorteada era eh_unico e o personagem já
        // possuía: guarda a entry ORIGINAL (a que seria concedida sem a
        // regra de duplicata) e marca que o fallback foi usado —
        // histórico sempre mostra o motivo real da substituição.
        eh_fallback: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        original_entry_key: { type: Sequelize.STRING(80), allowNull: true },
        pity_raro_mais_antes: { type: Sequelize.INTEGER, allowNull: false },
        pity_raro_mais_depois: { type: Sequelize.INTEGER, allowNull: false },
        pity_featured_antes: { type: Sequelize.INTEGER, allowNull: false },
        pity_featured_depois: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      });
      await queryInterface.addIndex("temple_draw_history", ["character_id", "draw_seq"], {
        name: "temple_draw_history_character_seq_idx",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("temple_draw_history");
    await queryInterface.dropTable("temple_draw_batches");
    await queryInterface.dropTable("character_temple_draw_state");
    await queryInterface.dropTable("temple_reward_entries");
    await queryInterface.dropTable("temple_reward_pools");

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_draw_history_reward_kind";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_temple_reward_entries_reward_kind";');
  },
};
