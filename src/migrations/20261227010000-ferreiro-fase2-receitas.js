"use strict";

// Profissão de Ferreiro §4/§9/§16 — Fase 2: camada de Receitas
// (conhecimento negociável) sobre o Blueprint já existente. Aditiva e
// forward-only: nenhum Blueprint existente muda de comportamento (todos
// nascem/ficam "Auto" — nunca bloqueando conteúdo que o jogador já
// fabricava, spec §16 "Cuidado com regressão").
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Items_tipo_item" ADD VALUE IF NOT EXISTS 'Receita';
    `);

    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("forge_recipes")) {
      await queryInterface.createTable("forge_recipes", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_blueprint: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        id_item: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        raridade_receita: { type: Sequelize.ENUM("Comum", "Raro", "Lendario"), allowNull: false },
        negociavel: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        consome_ao_aprender: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        pista_publica: { type: Sequelize.STRING(200), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
      });
    }

    if (!tabelas.includes("character_forge_recipe_unlocks")) {
      await queryInterface.createTable("character_forge_recipe_unlocks", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false },
        id_blueprint: { type: Sequelize.INTEGER, allowNull: false },
        source_type: {
          type: Sequelize.ENUM("EXPLORATION", "BOSS", "MARKET", "MISSION", "EVENT", "ADMIN", "OTHER"),
          allowNull: false,
          defaultValue: "OTHER",
        },
        source_id: { type: Sequelize.INTEGER, allowNull: true },
        learned_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("now()") },
      });
      await queryInterface.addConstraint("character_forge_recipe_unlocks", {
        fields: ["id_personagem", "id_blueprint"],
        type: "unique",
        name: "character_forge_recipe_unlocks_personagem_blueprint_unique",
      });
    }

    const colunasBlueprint = await queryInterface.describeTable("forge_blueprints");
    if (!colunasBlueprint.modo_desbloqueio) {
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE "enum_forge_blueprints_modo_desbloqueio" AS ENUM ('Auto', 'Receita');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
      await queryInterface.addColumn("forge_blueprints", "modo_desbloqueio", {
        type: Sequelize.ENUM("Auto", "Receita"),
        allowNull: false,
        defaultValue: "Auto",
      });
    }

    // §16.3 — todo Blueprint existente começa AUTO (backfill explícito,
    // ainda que já seja o default da coluna, pra deixar auditável que
    // essa decisão foi tomada conscientemente nesta migration).
    await queryInterface.sequelize.query(`UPDATE forge_blueprints SET modo_desbloqueio = 'Auto' WHERE modo_desbloqueio IS NULL;`);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("forge_blueprints", "modo_desbloqueio").catch(() => {});
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_forge_blueprints_modo_desbloqueio";`).catch(() => {});
    await queryInterface.dropTable("character_forge_recipe_unlocks").catch(() => {});
    await queryInterface.dropTable("forge_recipes").catch(() => {});
    // Postgres não suporta remover valor de ENUM sem recriar o tipo —
    // 'Receita' em enum_Items_tipo_item permanece (mesmo critério de
    // 20260930670000-item-tipo-espolio.js).
  },
};
