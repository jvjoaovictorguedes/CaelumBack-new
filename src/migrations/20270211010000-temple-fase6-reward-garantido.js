"use strict";

// Templo do Véu Celestial — Fase 6 (§10.1): além do roll ponderado já
// existente em temple_boss_reward_entries, o primeiro clear também
// concede um "grant garantido de conclusão" (ex.: Baú/Fragmento/Item
// de evento). garantido=true marca as entries que saem do pool
// ponderado e são concedidas sempre (ainda respeitando a reward band
// de nível), em vez de concorrerem pelo único roll.
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("temple_boss_reward_entries");
    if (!colunas.garantido) {
      await queryInterface.addColumn("temple_boss_reward_entries", "garantido", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const colunas = await queryInterface.describeTable("temple_boss_reward_entries");
    if (colunas.garantido) {
      await queryInterface.removeColumn("temple_boss_reward_entries", "garantido");
    }
  },
};
