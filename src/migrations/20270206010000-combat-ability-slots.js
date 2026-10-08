"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const table = await queryInterface.describeTable("CharacterAbilities", {
        transaction,
      });
      if (!table.combat_slot)
        await queryInterface.addColumn(
          "CharacterAbilities",
          "combat_slot",
          {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          { transaction },
        );
      await queryInterface.sequelize.query(
        `
        WITH ranked AS (
          SELECT ca.id, ROW_NUMBER() OVER (PARTITION BY ca.id_personagem ORDER BY ca.id) - 1 AS slot
          FROM "CharacterAbilities" ca JOIN "Powers" p ON p.id = ca.id_power
          WHERE ca.is_active = true AND p.tipo_poder = 'Ativo'
        )
        UPDATE "CharacterAbilities" ca SET combat_slot = ranked.slot
        FROM ranked WHERE ca.id = ranked.id AND ranked.slot < 5 AND ca.combat_slot IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS character_abilities_active_combat_slot
          ON "CharacterAbilities" (id_personagem, combat_slot)
          WHERE is_active = true AND combat_slot IS NOT NULL;
        ALTER TABLE "CharacterAbilities" ADD CONSTRAINT character_abilities_combat_slot_range
          CHECK (combat_slot IS NULL OR combat_slot BETWEEN 0 AND 4);
      `,
        { transaction },
      );
    });
  },
  async down(queryInterface) {
    await queryInterface.removeColumn("CharacterAbilities", "combat_slot");
  },
};
