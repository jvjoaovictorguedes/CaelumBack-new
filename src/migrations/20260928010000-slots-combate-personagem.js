"use strict";

// Loadout de combate — só os consumíveis (as habilidades reaproveitam
// CharacterAbilities.is_active, que já existia). Array de até 5
// posições fixas, cada uma null ou um id_item; a ordem importa (é o
// slot que o jogador vê na tela de Combate).
module.exports = {
  async up(queryInterface, Sequelize) {
    const tabela = await queryInterface.describeTable("Characters");
    if (tabela.slots_consumiveis_combate) {
      console.log("[migration] Characters.slots_consumiveis_combate já existe — pulando.");
      return;
    }
    await queryInterface.addColumn("Characters", "slots_consumiveis_combate", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [null, null, null, null, null],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Characters", "slots_consumiveis_combate");
  },
};
