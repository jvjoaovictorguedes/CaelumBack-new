"use strict";

// Guilda dos Aventureiros (ver Especificacao_Guilda_dos_Aventureiros) —
// Rank de Aventureiro + contratos, deliberadamente SEM prefixo "guild"
// no nome das tabelas novas (ver adventureGuildConfig.js: "GuildRank"
// já é o Portal de Ranque COLETIVO de guilda de verdade,
// GuildRankGate/guild_rank_gates — sistema diferente, não confundir).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("character_adventure_guild_progress")) {
      await queryInterface.createTable("character_adventure_guild_progress", {
        id_personagem: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        rank: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "F" },
        missoes_concluidas_no_rank: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        apto_para_promocao: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ultima_falha_provacao_em: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("adventure_guild_missions")) {
      await queryInterface.createTable("adventure_guild_missions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: false },
        nome: { type: Sequelize.STRING(150), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        tipo_objetivo: {
          type: Sequelize.ENUM(
            "MatarInimigos",
            "MatarMonstroEspecifico",
            "MatarNaRegiao",
            "VencerDuelos",
            "GanharOuro",
            "CompletarExpedicoes",
            "Fabricar",
            "Refinar",
            "Entregar",
            "AlcancarNivel",
          ),
          allowNull: false,
        },
        id_monstro_alvo: { type: Sequelize.INTEGER, allowNull: true, references: { model: "AdventureMonsters", key: "id" } },
        id_area_alvo: { type: Sequelize.INTEGER, allowNull: true, references: { model: "AdventureZones", key: "id" } },
        id_item_alvo: { type: Sequelize.INTEGER, allowNull: true, references: { model: "Items", key: "id" } },
        quantidade_objetivo: { type: Sequelize.INTEGER, allowNull: false },
        qualidade_minima: { type: Sequelize.STRING(20), allowNull: true },
        eh_provacao: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("adventure_guild_mission_rewards")) {
      await queryInterface.createTable("adventure_guild_mission_rewards", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_mission: { type: Sequelize.INTEGER, allowNull: false, references: { model: "adventure_guild_missions", key: "id" }, onDelete: "CASCADE" },
        tipo: { type: Sequelize.ENUM("Ouro", "XP", "Item"), allowNull: false },
        id_item: { type: Sequelize.INTEGER, allowNull: true, references: { model: "Items", key: "id" } },
        quantidade: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("adventure_guild_offers")) {
      await queryInterface.createTable("adventure_guild_offers", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        rank: { type: Sequelize.STRING(10), allowNull: false },
        janela_inicio: { type: Sequelize.DATE, allowNull: false },
        id_mission: { type: Sequelize.INTEGER, allowNull: false, references: { model: "adventure_guild_missions", key: "id" } },
        ordem: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("adventure_guild_offers", ["rank", "janela_inicio", "ordem"], {
        unique: true,
        name: "adventure_guild_offers_rank_janela_ordem_unique",
      });
      await queryInterface.addIndex("adventure_guild_offers", ["rank", "janela_inicio", "id_mission"], {
        unique: true,
        name: "adventure_guild_offers_rank_janela_missao_unique",
      });
    }

    if (!tabelas.includes("character_adventure_guild_contracts")) {
      await queryInterface.createTable("character_adventure_guild_contracts", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_offer: { type: Sequelize.INTEGER, allowNull: true, references: { model: "adventure_guild_offers", key: "id" } },
        id_mission: { type: Sequelize.INTEGER, allowNull: false, references: { model: "adventure_guild_missions", key: "id" } },
        eh_provacao: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        progresso_atual: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: {
          type: Sequelize.ENUM("Ativo", "Concluido", "Expirado", "Resgatado", "Falhou"),
          allowNull: false,
          defaultValue: "Ativo",
        },
        aceito_em: { type: Sequelize.DATE, allowNull: false },
        expira_em: { type: Sequelize.DATE, allowNull: true },
        concluido_em: { type: Sequelize.DATE, allowNull: true },
        resgatado_em: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      // §39 — apoia a checagem "no máximo 2 contratos Ativos" e a
      // checagem "já aceitei esta oferta" sem varrer a tabela inteira.
      await queryInterface.addIndex("character_adventure_guild_contracts", ["id_personagem", "status"], {
        name: "character_adventure_guild_contracts_personagem_status_idx",
      });
    }

    // §6/§7/§8 — Mission (Diária/Semanal/Mensal) precisa dos novos
    // valores de categoria e dos 3 tipos novos usados nos exemplos da
    // spec (Expedição/Forja/contratos da Guilda). Nome exato dos tipos
    // confirmado em produção via \dT+ antes de escrever isto:
    // enum_missions_categoria / enum_missions_tipo (minúsculo, tabela
    // "missions").
    await queryInterface.sequelize.query(`ALTER TYPE enum_missions_categoria ADD VALUE IF NOT EXISTS 'Semanal';`);
    await queryInterface.sequelize.query(`ALTER TYPE enum_missions_categoria ADD VALUE IF NOT EXISTS 'Mensal';`);
    await queryInterface.sequelize.query(`ALTER TYPE enum_missions_tipo ADD VALUE IF NOT EXISTS 'CompletarExpedicoes';`);
    await queryInterface.sequelize.query(`ALTER TYPE enum_missions_tipo ADD VALUE IF NOT EXISTS 'Fabricar';`);
    await queryInterface.sequelize.query(`ALTER TYPE enum_missions_tipo ADD VALUE IF NOT EXISTS 'CompletarContratosGuilda';`);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_adventure_guild_contracts");
    await queryInterface.dropTable("adventure_guild_offers");
    await queryInterface.dropTable("adventure_guild_mission_rewards");
    await queryInterface.dropTable("adventure_guild_missions");
    await queryInterface.dropTable("character_adventure_guild_progress");
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_adventure_guild_missions_tipo_objetivo";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_adventure_guild_mission_rewards_tipo";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_character_adventure_guild_contracts_status";`);
    // Não removo os valores novos de enum_missions_categoria/tipo —
    // Postgres não suporta remover valor de ENUM sem recriar o tipo
    // inteiro, e algum personagem pode já ter dado progresso numa
    // missão desses tipos (mesmo raciocínio de 20260930670000-item-
    // tipo-espolio.js).
  },
};
