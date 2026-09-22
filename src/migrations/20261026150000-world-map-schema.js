"use strict";

// Mapa Mundial v1 — passo 1/3 (spec "Mapa de Caelum v1" §49): schema.
// world_territories / world_map_nodes / world_map_connections — ver
// os models pra comentários de design (WorldTerritory.js, WorldMapNode.js,
// WorldMapConnection.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("world_territories")) {
      await queryInterface.createTable("world_territories", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        slug: { type: Sequelize.STRING(100), allowNull: false, unique: true },
        descricao: { type: Sequelize.TEXT, allowNull: true },
        polygon_points: { type: Sequelize.JSONB, allowNull: false },
        label_x: { type: Sequelize.FLOAT, allowNull: false },
        label_y: { type: Sequelize.FLOAT, allowNull: false },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        controle_habilitado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    } else {
      console.log('[migration] "world_territories" já existe — pulando.');
    }

    if (!tabelas.includes("world_map_nodes")) {
      await queryInterface.createTable("world_map_nodes", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        nome: { type: Sequelize.STRING(100), allowNull: false },
        tipo: { type: Sequelize.ENUM("Adventure", "Expedition", "City", "Service", "Landmark"), allowNull: false },
        entity_id: { type: Sequelize.INTEGER, allowNull: true },
        id_territorio: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "world_territories", key: "id" },
          onDelete: "SET NULL",
        },
        x: { type: Sequelize.FLOAT, allowNull: false },
        y: { type: Sequelize.FLOAT, allowNull: false },
        icone_url: { type: Sequelize.STRING(255), allowNull: true },
        imagem_url: { type: Sequelize.STRING(255), allowNull: true },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        metadata: { type: Sequelize.JSONB, allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE world_map_nodes ADD CONSTRAINT world_map_nodes_x_check CHECK (x >= 0 AND x <= 100);`,
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE world_map_nodes ADD CONSTRAINT world_map_nodes_y_check CHECK (y >= 0 AND y <= 100);`,
      );
      await queryInterface.addIndex("world_map_nodes", ["tipo"], { name: "world_map_nodes_tipo_idx" });
      await queryInterface.addIndex("world_map_nodes", ["id_territorio"], { name: "world_map_nodes_territorio_idx" });
    } else {
      console.log('[migration] "world_map_nodes" já existe — pulando.');
    }

    if (!tabelas.includes("world_map_connections")) {
      await queryInterface.createTable("world_map_connections", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_origem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_map_nodes", key: "id" },
          onDelete: "CASCADE",
        },
        id_destino: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "world_map_nodes", key: "id" },
          onDelete: "CASCADE",
        },
        tipo: { type: Sequelize.STRING(30), allowNull: false, defaultValue: "Estrada" },
        ordem: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
    } else {
      console.log('[migration] "world_map_connections" já existe — pulando.');
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable("world_map_connections").catch(() => {});
    await queryInterface.dropTable("world_map_nodes").catch(() => {});
    await queryInterface.dropTable("world_territories").catch(() => {});
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "enum_world_map_nodes_tipo";`).catch(() => {});
  },
};
