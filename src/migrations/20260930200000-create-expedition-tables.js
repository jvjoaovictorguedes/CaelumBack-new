"use strict";

// Sistema de Expedição — 3 profissões (Mineração/Silvicultura/
// Exploração), cada uma com nível/XP/cooldown independentes por
// personagem, coletando em regiões que liberam por nível e sorteiam
// um recurso (peso relativo dentro da região) numa qualidade (sorteio
// por nível, config central em src/config/expeditionConfig.js).
//
// ExpeditionResourceItem é a peça-chave pedida na especificação: liga
// recurso+qualidade a um Item por ID (nunca por nome), pra nunca
// precisar de `Item.findOne({ where: { nome: ... } })` no meio de uma
// transação de coleta.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("character_professions")) {
      await queryInterface.createTable("character_professions", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        tipo: {
          type: Sequelize.ENUM("Mineracao", "Silvicultura", "Exploracao"),
          allowNull: false,
        },
        nivel: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        // XP TOTAL acumulado da profissão, nunca decrementado/zerado —
        // o nível é sempre recalculado a partir daqui (ver
        // expeditionProgressionService.js). Evita perder XP excedente
        // e facilita rebalancear a tabela de XP necessário depois.
        experiencia: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Cooldown persistido no banco (não em memória) — sobrevive a
        // restart do servidor e funciona com múltiplas instâncias.
        proxima_coleta_em: { type: Sequelize.DATE, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("character_professions", {
        fields: ["id_personagem", "tipo"],
        type: "unique",
        name: "character_professions_personagem_tipo_unique",
      });
    }

    if (!tabelas.includes("expedition_regions")) {
      await queryInterface.createTable("expedition_regions", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        profissao: {
          type: Sequelize.ENUM("Mineracao", "Silvicultura", "Exploracao"),
          allowNull: false,
        },
        nivel_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("expedition_resources")) {
      await queryInterface.createTable("expedition_resources", {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        profissao: {
          type: Sequelize.ENUM("Mineracao", "Silvicultura", "Exploracao"),
          allowNull: false,
        },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("expedition_resources", {
        fields: ["nome", "profissao"],
        type: "unique",
        name: "expedition_resources_nome_profissao_unique",
      });
    }

    if (!tabelas.includes("expedition_region_resources")) {
      await queryInterface.createTable("expedition_region_resources", {
        id_regiao: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "expedition_regions", key: "id" },
          onDelete: "CASCADE",
        },
        id_recurso: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "expedition_resources", key: "id" },
          onDelete: "CASCADE",
        },
        peso: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("expedition_region_resources", {
        fields: ["id_regiao", "id_recurso"],
        type: "primary key",
        name: "expedition_region_resources_pkey",
      });
    }

    if (!tabelas.includes("expedition_resource_items")) {
      await queryInterface.createTable("expedition_resource_items", {
        id_recurso: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "expedition_resources", key: "id" },
          onDelete: "CASCADE",
        },
        qualidade: {
          type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
          allowNull: false,
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("expedition_resource_items", {
        fields: ["id_recurso", "qualidade"],
        type: "primary key",
        name: "expedition_resource_items_pkey",
      });
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    for (const tabela of [
      "expedition_resource_items",
      "expedition_region_resources",
      "expedition_resources",
      "expedition_regions",
      "character_professions",
    ]) {
      if (tabelas.includes(tabela)) {
        await queryInterface.dropTable(tabela);
      }
    }
  },
};
