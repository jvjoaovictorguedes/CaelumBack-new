"use strict";

// Perfil de Jogador (Especificação Perfil de Jogador Caelum, §27/§49) —
// personalização (frase/título/destaques) separada do model Character
// pra não poluir o núcleo de combate com campos cosméticos. Feature
// nova, nenhuma tabela anterior a alterar.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("achievements")) {
      await queryInterface.createTable("achievements", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: false },
        icone_url: { type: Sequelize.STRING(255), allowNull: true },
        categoria: { type: Sequelize.STRING(40), allowNull: false },
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("titles")) {
      await queryInterface.createTable("titles", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        // Achievement que desbloqueia este título (§26 — conquista pode
        // desbloquear título) — null pra um título eventualmente
        // concedido por outro caminho (evento, admin).
        id_achievement_desbloqueia: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "achievements", key: "id" },
          onDelete: "SET NULL",
        },
        ativa: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("character_profiles")) {
      await queryInterface.createTable("character_profiles", {
        id_personagem: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        frase: { type: Sequelize.STRING(140), allowNull: true },
        id_titulo_selecionado: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "titles", key: "id" },
          onDelete: "SET NULL",
        },
        // Reservado pra v2 (§27/§174 — background de perfil); não usado
        // na v1.
        background_key: { type: Sequelize.STRING(60), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    }

    if (!tabelas.includes("character_achievements")) {
      await queryInterface.createTable("character_achievements", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_achievement: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "achievements", key: "id" },
          onDelete: "CASCADE",
        },
        desbloqueada_em: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      // Concessão idempotente (§51) — a unique é o que garante que
      // grantByKey nunca duplica, mesmo chamado duas vezes em paralelo.
      await queryInterface.addConstraint("character_achievements", {
        fields: ["id_personagem", "id_achievement"],
        type: "unique",
        name: "character_achievements_personagem_achievement_unique",
      });
    }

    if (!tabelas.includes("character_titles")) {
      await queryInterface.createTable("character_titles", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_title: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "titles", key: "id" },
          onDelete: "CASCADE",
        },
        desbloqueado_em: { type: Sequelize.DATE, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addConstraint("character_titles", {
        fields: ["id_personagem", "id_title"],
        type: "unique",
        name: "character_titles_personagem_title_unique",
      });
    }

    if (!tabelas.includes("character_profile_achievement_highlights")) {
      await queryInterface.createTable("character_profile_achievement_highlights", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        slot: { type: Sequelize.INTEGER, allowNull: false },
        id_achievement: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "achievements", key: "id" },
          onDelete: "CASCADE",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      // §24 — unique por personagem+slot (um destaque por posição) E por
      // personagem+achievement (a mesma conquista não repete em dois
      // slots).
      await queryInterface.addConstraint("character_profile_achievement_highlights", {
        fields: ["id_personagem", "slot"],
        type: "unique",
        name: "perfil_achv_highlight_personagem_slot_unique",
      });
      await queryInterface.addConstraint("character_profile_achievement_highlights", {
        fields: ["id_personagem", "id_achievement"],
        type: "unique",
        name: "perfil_achv_highlight_personagem_achievement_unique",
      });
    }

    if (!tabelas.includes("character_profile_monster_highlights")) {
      await queryInterface.createTable("character_profile_monster_highlights", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        slot: { type: Sequelize.INTEGER, allowNull: false },
        // AdventureMonster.id (§29 — mesmo que CharacterMonsterKill seja
        // por nome, o destaque usa ID e resolve a validação pelo nome
        // atual do catálogo).
        id_monstro: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "AdventureMonsters", key: "id" },
          onDelete: "CASCADE",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addConstraint("character_profile_monster_highlights", {
        fields: ["id_personagem", "slot"],
        type: "unique",
        name: "perfil_monstro_highlight_personagem_slot_unique",
      });
      await queryInterface.addConstraint("character_profile_monster_highlights", {
        fields: ["id_personagem", "id_monstro"],
        type: "unique",
        name: "perfil_monstro_highlight_personagem_monstro_unique",
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_profile_monster_highlights");
    await queryInterface.dropTable("character_profile_achievement_highlights");
    await queryInterface.dropTable("character_titles");
    await queryInterface.dropTable("character_achievements");
    await queryInterface.dropTable("character_profiles");
    await queryInterface.dropTable("titles");
    await queryInterface.dropTable("achievements");
  },
};
