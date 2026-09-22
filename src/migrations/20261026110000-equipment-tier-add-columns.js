"use strict";

// Reestruturação de Tier de Equipamentos — passo 1/3 (spec §17/§18):
// só o schema. tier_equipamento fica NULLABLE em "Items" (tipos não
// equipáveis — Material/Consumivel/QuestItem/Currencia/Espolio — devem
// permanecer null pra sempre, §17) e em forge_blueprints por enquanto
// (vira NOT NULL depois de backfillado, ver próxima migration) — nunca
// setar NOT NULL antes de preencher os dados, senão a própria migration
// de ADD COLUMN quebra em cima de linhas já existentes.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabelaItems = await queryInterface.describeTable("Items");
    if (!tabelaItems.tier_equipamento) {
      await queryInterface.addColumn("Items", "tier_equipamento", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE "Items" ADD CONSTRAINT items_tier_equipamento_check CHECK (tier_equipamento IS NULL OR tier_equipamento BETWEEN 1 AND 5);`,
      );
      await queryInterface.addIndex("Items", ["tier_equipamento"], { name: "items_tier_equipamento_idx" });
    } else {
      console.log('[migration] "Items".tier_equipamento já existe — pulando.');
    }

    const tabelaBlueprints = await queryInterface.describeTable("forge_blueprints");
    if (!tabelaBlueprints.tier_equipamento) {
      await queryInterface.addColumn("forge_blueprints", "tier_equipamento", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
      await queryInterface.sequelize.query(
        `ALTER TABLE forge_blueprints ADD CONSTRAINT forge_blueprints_tier_equipamento_check CHECK (tier_equipamento IS NULL OR tier_equipamento BETWEEN 1 AND 5);`,
      );
    } else {
      console.log("[migration] forge_blueprints.tier_equipamento já existe — pulando.");
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`ALTER TABLE "Items" DROP CONSTRAINT IF EXISTS items_tier_equipamento_check;`);
    await queryInterface.removeIndex("Items", "items_tier_equipamento_idx").catch(() => {});
    await queryInterface.removeColumn("Items", "tier_equipamento").catch(() => {});

    await queryInterface.sequelize.query(
      `ALTER TABLE forge_blueprints DROP CONSTRAINT IF EXISTS forge_blueprints_tier_equipamento_check;`,
    );
    await queryInterface.removeColumn("forge_blueprints", "tier_equipamento").catch(() => {});
  },
};
