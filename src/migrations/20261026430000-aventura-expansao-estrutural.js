"use strict";

// Expansão Aventura Beta §46 passo 1-3 — só estrutura (colunas/tabelas
// novas), nenhum dado de conteúdo ainda. Separado das migrations de
// conteúdo de propósito (§46: "separar migrations estruturais de
// migrations de conteúdo quando possível").
module.exports = {
  async up(queryInterface, Sequelize) {
    const monstros = await queryInterface.describeTable("AdventureMonsters");
    if (!monstros.sprite_key) {
      await queryInterface.addColumn("AdventureMonsters", "sprite_key", {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }

    const zonas = await queryInterface.describeTable("AdventureZones");
    if (!zonas.battle_background_url) {
      await queryInterface.addColumn("AdventureZones", "battle_background_url", {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    const tabelas = await queryInterface.showAllTables();

    if (!tabelas.includes("CharacterZoneMasteryFloors")) {
      await queryInterface.createTable("CharacterZoneMasteryFloors", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_personagem: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Characters", key: "id" },
          onDelete: "CASCADE",
        },
        id_area: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "AdventureZones", key: "id" },
          onDelete: "CASCADE",
        },
        nivel_piso: { type: Sequelize.INTEGER, allowNull: false },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("CharacterZoneMasteryFloors", ["id_personagem", "id_area"], {
        unique: true,
        name: "character_zone_mastery_floor_unique",
      });
    }

    if (!tabelas.includes("AdventureMonsterLoots")) {
      await queryInterface.createTable("AdventureMonsterLoots", {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        id_monstro: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "AdventureMonsters", key: "id" },
          onDelete: "CASCADE",
        },
        id_item: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: "Items", key: "id" },
          onDelete: "CASCADE",
        },
        // §20 — rolagem independente por entrada, nunca uma escolha
        // exclusiva entre os drops do mesmo monstro (ver §21).
        chance_ppm: { type: Sequelize.INTEGER, allowNull: false },
        quantidade_min: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        quantidade_max: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        categoria: {
          type: Sequelize.ENUM("Principal", "Secundario", "Especial"),
          allowNull: false,
          defaultValue: "Principal",
        },
        ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      });
      await queryInterface.addIndex("AdventureMonsterLoots", ["id_monstro"]);
    }
  },

  async down(queryInterface) {
    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("AdventureMonsterLoots")) await queryInterface.dropTable("AdventureMonsterLoots");
    if (tabelas.includes("CharacterZoneMasteryFloors")) await queryInterface.dropTable("CharacterZoneMasteryFloors");

    const zonas = await queryInterface.describeTable("AdventureZones");
    if (zonas.battle_background_url) await queryInterface.removeColumn("AdventureZones", "battle_background_url");

    const monstros = await queryInterface.describeTable("AdventureMonsters");
    if (monstros.sprite_key) await queryInterface.removeColumn("AdventureMonsters", "sprite_key");
  },
};
