"use strict";

// Núcleo do "Aprimoramento do Sistema de Guildas": novas colunas em
// Guild/GuildContribution, novas permissões, e as 3 tabelas de Missões
// da Guilda (catálogo / ciclo ativo / progresso individual). A migração
// do Boss (Portal -> Boss) vai numa migration separada, ela mexe em
// tabelas maiores e é mais fácil de revisar isolada.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();
    const guilds = await queryInterface.describeTable("Guilds");

    if (!guilds.missoes_rank_concluidas_no_rank_atual) {
      await queryInterface.addColumn("Guilds", "missoes_rank_concluidas_no_rank_atual", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!guilds.experiencia_total_ganha) {
      await queryInterface.addColumn("Guilds", "experiencia_total_ganha", {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
      });
      // Backfill: assume que o XP atual dentro do nível já é o piso do
      // histórico total (nunca vai ficar "negativo"/incoerente, só
      // subestimado pro que já foi gasto subindo de nível antes desta
      // migration — aceitável, não há como reconstruir o que já foi
      // consumido).
      await queryInterface.sequelize.query(
        `UPDATE "Guilds" SET experiencia_total_ganha = experiencia;`,
      );
    }
    if (!guilds.bosses_derrotados_total) {
      await queryInterface.addColumn("Guilds", "bosses_derrotados_total", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }

    // Rank da guilda muda de escada (F..S++ -> F..S própria, ver
    // guildConfig.js) — reseta pra F, igual ao que foi feito em
    // Character.rank quando o Portal individual saiu (mesma decisão:
    // "resetar todos os ranks já existentes fica clean").
    await queryInterface.sequelize.query(`UPDATE "Guilds" SET rank = 'F';`);

    // Doação não gera mais XP de guilda (§15) — remove os campos de
    // controle de teto diário, se ainda existirem.
    const contribuicoes = await queryInterface.describeTable("GuildContributions");
    if (contribuicoes.xp_doacao_hoje) {
      await queryInterface.removeColumn("GuildContributions", "xp_doacao_hoje");
    }
    if (contribuicoes.data_ultimo_xp_doacao) {
      await queryInterface.removeColumn("GuildContributions", "data_ultimo_xp_doacao");
    }

    // Novas permissões (substituem iniciar_portal na prática, ver
    // GuildRolePermission.js) — Postgres não deixa remover valor de
    // ENUM sem recriar o tipo, então só adiciona os novos.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_GuildRolePermissions_permissao" ADD VALUE IF NOT EXISTS 'liberar_boss';`,
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_GuildRolePermissions_permissao" ADD VALUE IF NOT EXISTS 'comprar_beneficios';`,
    );
    // Nota: "iniciar_portal" nunca chegou a existir no ENUM do banco
    // (só no PADRAO em memória de guildPermissionService.js) — nenhuma
    // linha de override pode ter sido gravada com esse valor, então não
    // há nada pra limpar aqui.

    if (!tabelas.includes("guild_buffs")) {
      await queryInterface.createTable("guild_buffs", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Guilds", key: "id" } },
        tipo: { type: Sequelize.ENUM("XP", "GOLD", "FORJA"), allowNull: false },
        nivel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("guild_buffs", ["id_guild", "tipo"], { unique: true });
    }

    if (!tabelas.includes("guild_missions")) {
      await queryInterface.createTable("guild_missions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        categoria: { type: Sequelize.ENUM("Diaria", "Semanal", "Mensal", "Rank"), allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: true },
        nome: { type: Sequelize.STRING(150), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        tipo_objetivo: {
          type: Sequelize.ENUM(
            "MatarInimigos",
            "GanharOuro",
            "CompletarExpedicoes",
            "Fabricar",
            "Refinar",
            "VencerDuelos",
          ),
          allowNull: false,
        },
        meta: { type: Sequelize.INTEGER, allowNull: false },
        xp_guilda: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        pontos_contribuicao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("guild_mission_cycles")) {
      await queryInterface.createTable("guild_mission_cycles", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Guilds", key: "id" } },
        categoria: { type: Sequelize.ENUM("Diaria", "Semanal", "Mensal", "Rank"), allowNull: false },
        id_guild_mission: { type: Sequelize.INTEGER, allowNull: false, references: { model: "guild_missions", key: "id" } },
        ciclo_inicio: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("guild_mission_cycles", ["id_guild", "categoria", "ciclo_inicio"], {
        unique: true,
      });
    }

    if (!tabelas.includes("guild_member_mission_progress")) {
      await queryInterface.createTable("guild_member_mission_progress", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_guild_mission_cycle: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "guild_mission_cycles", key: "id" },
        },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" } },
        progresso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        concluida: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        xp_concedida: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("guild_member_mission_progress", ["id_guild_mission_cycle", "id_personagem"], {
        unique: true,
      });
    }
  },

  async down(queryInterface) {
    for (const tabela of [
      "guild_member_mission_progress",
      "guild_mission_cycles",
      "guild_missions",
      "guild_buffs",
    ]) {
      const tabelas = await queryInterface.showAllTables();
      if (tabelas.includes(tabela)) await queryInterface.dropTable(tabela);
    }
    const contribuicoes = await queryInterface.describeTable("GuildContributions");
    if (!contribuicoes.xp_doacao_hoje) {
      await queryInterface.addColumn("GuildContributions", "xp_doacao_hoje", {
        type: require("sequelize").INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!contribuicoes.data_ultimo_xp_doacao) {
      await queryInterface.addColumn("GuildContributions", "data_ultimo_xp_doacao", {
        type: require("sequelize").DATEONLY,
        allowNull: true,
      });
    }
    const guilds = await queryInterface.describeTable("Guilds");
    if (guilds.missoes_rank_concluidas_no_rank_atual) {
      await queryInterface.removeColumn("Guilds", "missoes_rank_concluidas_no_rank_atual");
    }
    if (guilds.experiencia_total_ganha) {
      await queryInterface.removeColumn("Guilds", "experiencia_total_ganha");
    }
    if (guilds.bosses_derrotados_total) {
      await queryInterface.removeColumn("Guilds", "bosses_derrotados_total");
    }
  },
};
