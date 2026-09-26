"use strict";

// Reformulação "Item Único por Equipamento, Raridade por Instância"
// (spec V2) — fase EXPAND. Só adiciona colunas nullable, não migra dado
// nenhum ainda e não muda nenhum comportamento de runtime (o código
// continua lendo Item.raridade normalmente até a fase Switch).
//
// - CharacterEquipmentInstance.raridade: NULL temporário até o
//   Backfill preencher a partir do Item legado de cada instância.
// - ForgeBlueprint.id_item_resultado: NULL temporário até o Backfill
//   decidir o Item canônico de cada blueprint (a variante Comum).
//
// ForgeBlueprintResult continua existindo e sendo usado nesta fase —
// só é removido no Contract, depois que Forja/Refino/Mercado/Sets
// tiverem migrado pra ler raridade da instância.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        "character_equipment_instances",
        "raridade",
        {
          type: Sequelize.ENUM("Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"),
          allowNull: true,
        },
        { transaction },
      );

      await queryInterface.addColumn(
        "forge_blueprints",
        "id_item_resultado",
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: "Items", key: "id" },
          onDelete: "RESTRICT",
        },
        { transaction },
      );
      await queryInterface.addIndex("forge_blueprints", ["id_item_resultado"], { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex("forge_blueprints", ["id_item_resultado"], { transaction });
      await queryInterface.removeColumn("forge_blueprints", "id_item_resultado", { transaction });
      await queryInterface.removeColumn("character_equipment_instances", "raridade", { transaction });
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_character_equipment_instances_raridade";', { transaction });
    });
  },
};
