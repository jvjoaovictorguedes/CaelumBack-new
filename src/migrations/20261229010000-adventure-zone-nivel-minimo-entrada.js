"use strict";

// Pedido do jogador: até agora nivel_monstro_min/max da zona era só
// RECOMENDADO (badge de perigo na UI), nunca bloqueava entrada — um
// personagem nível 1 podia entrar direto no Covil do Minotauro (§4 do
// desenho antigo, documentado no comment de AdventureZone.js). Este
// campo novo passa a ser um GATE de verdade: character.nivel precisa
// ser >= nivel_jogador_minimo da zona pra entrar (ver adventureService.
// entrarNaZona e partySocket "party:iniciar").
//
// Backfill usa o próprio nivel_monstro_min de cada zona já cadastrada
// — é exatamente o valor que a progressão 1→50 das 10 áreas do Beta já
// usa pra decidir "a partir de que nível essa área faz sentido" (ver
// config/adventureExpansionData.js), só que agora vira regra, não só
// indicação visual.
module.exports = {
  async up(queryInterface, Sequelize) {
    const colunas = await queryInterface.describeTable("AdventureZones");
    if (!colunas.nivel_jogador_minimo) {
      await queryInterface.addColumn("AdventureZones", "nivel_jogador_minimo", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      });
    }

    await queryInterface.sequelize.query(
      `UPDATE "AdventureZones" SET nivel_jogador_minimo = nivel_monstro_min;`,
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AdventureZones", "nivel_jogador_minimo");
  },
};
