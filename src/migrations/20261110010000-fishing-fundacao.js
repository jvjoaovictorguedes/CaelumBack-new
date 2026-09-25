"use strict";

// Pesca & Navegação — Fase 1 (Fundação) + parte da Fase 2 (Forja) da
// especificação (pesca_spec.txt). Domínio novo, reaproveita Item/
// CharacterEquipmentInstance/WorldMapNode/WorldMapConnection como
// infraestrutura (spec §5/§32). Idempotente (showAllTables) igual ao
// padrão já usado pela migration de fundação da Alquimia.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    // Ferramenta: novo tipo de Item pra Vara de Pesca — instanciável mas
    // NUNCA equipável em combate (spec §9.1/§9.2/§38). ENUM aditivo,
    // nunca editando a migration histórica que criou o tipo.
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Items_tipo_item" ADD VALUE IF NOT EXISTS 'Ferramenta';
    `);

    // Vara reutiliza o MESMO pipeline de Forja (fila/pergaminho/chance) —
    // precisa entrar na categoria de blueprint (spec §10.1).
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_forge_blueprints_categoria_equipamento" ADD VALUE IF NOT EXISTS 'Ferramenta';
    `);

    if (!tabelas.includes("fishing_species")) {
      await queryInterface.createTable("fishing_species", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        nome_cientifico: { type: Sequelize.STRING(150), allowNull: true },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        comportamento_key: {
          type: Sequelize.ENUM("CALM", "BURST", "ERRATIC", "ENDURANCE", "DEEP_DIVE"),
          allowNull: false,
        },
        dificuldade_base: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        peso_min_g: { type: Sequelize.INTEGER, allowNull: false },
        peso_max_g: { type: Sequelize.INTEGER, allowNull: false },
        perfil_peso: { type: Sequelize.ENUM("LIGHT", "NORMAL", "HEAVY"), allowNull: false, defaultValue: "NORMAL" },
        pontos_base_torneio: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        lendario: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("fishing_zones")) {
      await queryInterface.createTable("fishing_zones", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        id_world_node: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "world_map_nodes", key: "id" },
          onDelete: "SET NULL",
        },
        nivel_pesca_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        tier_embarcacao_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        dificuldade_ambiente: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("fishing_zone_species")) {
      await queryInterface.createTable("fishing_zone_species", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_zone: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_zones", key: "id" }, onDelete: "CASCADE" },
        id_species: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_species", key: "id" }, onDelete: "CASCADE" },
        encounter_weight: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        nivel_pesca_minimo: { type: Sequelize.INTEGER, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("fishing_zone_species", {
        fields: ["id_zone", "id_species"],
        type: "unique",
        name: "fishing_zone_species_zone_species_unique",
      });
    }

    if (!tabelas.includes("fishing_baits")) {
      await queryInterface.createTable("fishing_baits", {
        id_item: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: "Items", key: "id" }, onDelete: "RESTRICT" },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        nome_exibicao: { type: Sequelize.STRING(100), allowNull: true },
        nivel_pesca_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("fishing_bait_affinities")) {
      await queryInterface.createTable("fishing_bait_affinities", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_bait_item: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_baits", key: "id_item" }, onDelete: "CASCADE" },
        id_species: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_species", key: "id" }, onDelete: "CASCADE" },
        multiplicador_peso_ppm: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1_000_000 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("fishing_bait_affinities", {
        fields: ["id_bait_item", "id_species"],
        type: "unique",
        name: "fishing_bait_affinities_bait_species_unique",
      });
    }

    if (!tabelas.includes("fishing_rod_properties")) {
      await queryInterface.createTable("fishing_rod_properties", {
        id_item: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: "Items", key: "id" }, onDelete: "CASCADE" },
        forca_linha: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        controle: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        recolhimento: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        precisao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        estabilidade: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
        nivel_pesca_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_fishing_progress")) {
      await queryInterface.createTable("character_fishing_progress", {
        id_personagem: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        nivel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        experiencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_capturado: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_fishing_loadout")) {
      await queryInterface.createTable("character_fishing_loadout", {
        id_personagem: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_instancia_vara: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "character_equipment_instances", key: "id" },
          onDelete: "SET NULL",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("fishing_sessions")) {
      await queryInterface.createTable("fishing_sessions", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_zone: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_zones", key: "id" }, onDelete: "RESTRICT" },
        id_instancia_vara: { type: Sequelize.INTEGER, allowNull: true },
        id_bait_item: { type: Sequelize.INTEGER, allowNull: true },
        id_species: { type: Sequelize.INTEGER, allowNull: true },
        weight_g: { type: Sequelize.INTEGER, allowNull: true },
        behavior_seed: { type: Sequelize.INTEGER, allowNull: true },
        fase: {
          type: Sequelize.ENUM(
            "CREATED", "CASTING", "WAITING_BITE", "HOOK_WINDOW", "FIGHTING",
            "CAUGHT", "ESCAPED", "BROKEN_LINE", "EXPIRED", "ABORTED",
          ),
          allowNull: false,
          defaultValue: "CREATED",
        },
        tensao: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        progresso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        sequence: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        resultado_payload: { type: Sequelize.JSONB, allowNull: true },
        mordida_disponivel_em: { type: Sequelize.DATE, allowNull: true },
        janela_mordida_expira_em: { type: Sequelize.DATE, allowNull: true },
        isca_consumida: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        started_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        expires_at: { type: Sequelize.DATE, allowNull: false },
        finalized_at: { type: Sequelize.DATE, allowNull: true },
        result: { type: Sequelize.STRING(20), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      // Uma única sessão ATIVA por personagem (spec §15.3/§30) — índice
      // parcial só sobre fases não-terminais.
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX fishing_sessions_uma_ativa_por_personagem
        ON fishing_sessions (id_personagem)
        WHERE fase NOT IN ('CAUGHT','ESCAPED','BROKEN_LINE','EXPIRED','ABORTED');
      `);
    }

    if (!tabelas.includes("fishing_catch_records")) {
      await queryInterface.createTable("fishing_catch_records", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_species: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_species", key: "id" }, onDelete: "RESTRICT" },
        id_zone: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_zones", key: "id" }, onDelete: "RESTRICT" },
        id_session: {
          type: Sequelize.INTEGER,
          allowNull: true,
          unique: true,
          references: { model: "fishing_sessions", key: "id" },
          onDelete: "SET NULL",
        },
        weight_g: { type: Sequelize.INTEGER, allowNull: false },
        quality: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        id_rod_item: { type: Sequelize.INTEGER, allowNull: true },
        refinamento_vara_snapshot: { type: Sequelize.INTEGER, allowNull: true },
        id_bait_item: { type: Sequelize.INTEGER, allowNull: true },
        caught_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_fishing_species_discoveries")) {
      await queryInterface.createTable("character_fishing_species_discoveries", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_species: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_species", key: "id" }, onDelete: "CASCADE" },
        descoberto_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        total_capturado: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        maior_peso_g: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("character_fishing_species_discoveries", {
        fields: ["id_personagem", "id_species"],
        type: "unique",
        name: "char_fishing_species_discoveries_unique",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_fishing_species_discoveries");
    await queryInterface.dropTable("fishing_catch_records");
    await queryInterface.dropTable("fishing_sessions");
    await queryInterface.dropTable("character_fishing_loadout");
    await queryInterface.dropTable("character_fishing_progress");
    await queryInterface.dropTable("fishing_rod_properties");
    await queryInterface.dropTable("fishing_bait_affinities");
    await queryInterface.dropTable("fishing_baits");
    await queryInterface.dropTable("fishing_zone_species");
    await queryInterface.dropTable("fishing_zones");
    await queryInterface.dropTable("fishing_species");
    // Enums aditivos (Ferramenta em Items/ForgeBlueprint) não são
    // revertidos — Postgres não suporta remover valor de ENUM sem
    // recriar o tipo inteiro, e o risco não vale a pena numa migration
    // reversível "de boa-fé" (mesmo critério de 20260930670000).
  },
};
