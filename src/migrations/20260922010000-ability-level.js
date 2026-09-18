"use strict";

// Fase 1 do sistema de "Grimórios": cada habilidade aprendida (linha de
// CharacterAbilities) agora evolui de nível 1 até 10 por conta própria,
// gastando ouro + Fragmentos de Grimório (ver abilityLevelService.js) —
// em vez de todo personagem com o mesmo poder causar sempre o mesmo
// dano/cura pra sempre.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("CharacterAbilities");

    if (!("nivel_habilidade" in descricao)) {
      await queryInterface.addColumn("CharacterAbilities", "nivel_habilidade", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("CharacterAbilities");
    if ("nivel_habilidade" in descricao) {
      await queryInterface.removeColumn("CharacterAbilities", "nivel_habilidade");
    }
  },
};
