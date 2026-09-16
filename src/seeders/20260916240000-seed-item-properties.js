"use strict";

// Preenche as tabelas satélite dos itens do seed anterior: capacete
// (ArmorProperties), espada (WeaponProperties) e poções
// (consumable_properties). efeito_vida/efeito_mana são PERCENTUAIS da
// vida/mana máxima (30 = 30%), não pontos fixos — cura fixa vira
// inútil assim que a vida/mana máxima escala com vitalidade/
// inteligência/equipamento/classe.
module.exports = {
  async up(queryInterface) {
    const [armorRows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "ArmorProperties" WHERE id_item = 1;',
    );
    if (armorRows[0].count === 0) {
      await queryInterface.bulkInsert("ArmorProperties", [
        {
          id_item: 1,
          slot_equipamento: "Cabeca",
          defesa: 5,
          bonus_forca: 0,
          bonus_vitalidade: 2,
          bonus_inteligencia: 0,
          bonus_agilidade: 0,
          bonus_velocidade: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    const [weaponRows] = await queryInterface.sequelize.query(
      'SELECT COUNT(*)::int AS count FROM "WeaponProperties" WHERE id_item = 2;',
    );
    if (weaponRows[0].count === 0) {
      await queryInterface.bulkInsert("WeaponProperties", [
        {
          id_item: 2,
          dano_min: 8,
          dano_max: 14,
          tipo_dano: "Fisico",
          tipo_arma: "Espada",
          bonus_atributo: "Forca",
          valor_bonus_atributo: 1.1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    }

    const [consumableRows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS count FROM consumable_properties WHERE id_item = 3;",
    );
    if (consumableRows[0].count === 0) {
      await queryInterface.bulkInsert("consumable_properties", [
        {
          id_item: 3,
          efeito_vida: 30,
          efeito_mana: 0,
          valor_atributo: 0,
        },
      ]);
    }

    const [manaRows] = await queryInterface.sequelize.query(
      "SELECT COUNT(*)::int AS count FROM consumable_properties WHERE id_item = 4;",
    );
    if (manaRows[0].count === 0) {
      await queryInterface.bulkInsert("consumable_properties", [
        {
          id_item: 4,
          efeito_vida: 0,
          efeito_mana: 30,
          valor_atributo: 0,
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("ArmorProperties", { id_item: 1 });
    await queryInterface.bulkDelete("WeaponProperties", { id_item: 2 });
    await queryInterface.bulkDelete("consumable_properties", { id_item: [3, 4] });
  },
};
