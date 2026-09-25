"use strict";

// Pesca & Navegação — fatia MÍNIMA da Fase 5 (Navegação), só o
// suficiente pra dar gate de acesso às FishingZone (spec §18, escopo
// reduzido documentado no relatório final: sem condições marítimas, sem
// UI rica de mapa/viagem — viagem instantânea, spec §18.3 permite
// explicitamente).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("vessels")) {
      await queryInterface.createTable("vessels", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        tier: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        nivel_pesca_minimo: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        preco: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_vessels")) {
      await queryInterface.createTable("character_vessels", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_vessel: { type: Sequelize.INTEGER, allowNull: false, references: { model: "vessels", key: "id" }, onDelete: "CASCADE" },
        selecionada: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        adquirida_em: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
      await queryInterface.addConstraint("character_vessels", {
        fields: ["id_personagem", "id_vessel"],
        type: "unique",
        name: "character_vessels_personagem_vessel_unique",
      });
    }

    if (!tabelas.includes("fishing_ports")) {
      await queryInterface.createTable("fishing_ports", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        id_world_node: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "world_map_nodes", key: "id" },
          onDelete: "SET NULL",
        },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("marine_routes")) {
      await queryInterface.createTable("marine_routes", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_world_connection: {
          type: Sequelize.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "world_map_connections", key: "id" },
          onDelete: "CASCADE",
        },
        id_port_origem: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_ports", key: "id" }, onDelete: "CASCADE" },
        id_zone_destino: { type: Sequelize.INTEGER, allowNull: false, references: { model: "fishing_zones", key: "id" }, onDelete: "CASCADE" },
        min_vessel_tier: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        distance: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }

    if (!tabelas.includes("character_navigation_state")) {
      await queryInterface.createTable("character_navigation_state", {
        id_personagem: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, references: { model: "Characters", key: "id" }, onDelete: "CASCADE" },
        id_port_atual: { type: Sequelize.INTEGER, allowNull: true, references: { model: "fishing_ports", key: "id" }, onDelete: "SET NULL" },
        id_zone_atual: { type: Sequelize.INTEGER, allowNull: true, references: { model: "fishing_zones", key: "id" }, onDelete: "SET NULL" },
        createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("character_navigation_state");
    await queryInterface.dropTable("marine_routes");
    await queryInterface.dropTable("fishing_ports");
    await queryInterface.dropTable("character_vessels");
    await queryInterface.dropTable("vessels");
  },
};
