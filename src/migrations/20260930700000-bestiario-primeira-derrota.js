"use strict";

// Bestiário (§9 da spec): "descoberto" é derivado da existência de uma
// linha em character_monster_kills com quantidade >= 1 — a coluna
// nome_monstro já é EXATAMENTE o Item.nome de AdventureMonster (mesmo
// valor gravado em combatController.js na vitória), então dá pra juntar
// as duas sem duplicar contador nenhum. Só faltava saber QUANDO a
// primeira derrota aconteceu (a spec pede a ficha completa "depois da
// primeira derrota"), por isso só esta coluna nova — decisão
// deliberada de reaproveitar a tabela existente em vez de criar uma
// "CharacterMonsterProgress" paralela como a spec sugere como exemplo
// (ver relatório final da feature).
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("character_monster_kills");
    if (!descricao.primeira_derrota_em) {
      await queryInterface.addColumn("character_monster_kills", "primeira_derrota_em", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("character_monster_kills");
    if (descricao.primeira_derrota_em) {
      await queryInterface.removeColumn("character_monster_kills", "primeira_derrota_em");
    }
  },
};
