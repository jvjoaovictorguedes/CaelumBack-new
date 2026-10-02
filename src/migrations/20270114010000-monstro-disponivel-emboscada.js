"use strict";

// Emboscada da Expedição (Mineração/Silvicultura/Exploração) gerava um
// inimigo 100% procedural (gerarInimigo em combatController.js, sem
// nenhum vínculo com o catálogo de AdventureMonster — só um nome
// decorativo sorteado de uma lista fixa de 9 flavors, sem sprite nem
// identidade real). Pedido do jogador: admin escolher QUAIS monstros
// do catálogo real podem aparecer na emboscada.
//
// Default TRUE — sem isso, a emboscada ficaria sem nenhum monstro
// elegível assim que esta coluna existisse (todo o catálogo nasceria
// desmarcado), quebrando a feature até o admin configurar algo. Com
// default true, todo monstro já cadastrado começa elegível; quem quer
// uma emboscada mais curada desmarca manualmente os que não encaixam.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("AdventureMonsters", "disponivel_emboscada", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AdventureMonsters", "disponivel_emboscada");
  },
};
