"use strict";

// Pedido do jogador: até agora nivel_monstro_min/max da zona era só
// RECOMENDADO (badge de perigo na UI), nunca bloqueava entrada — um
// personagem nível 1 podia entrar direto no Covil do Minotauro (§4 do
// desenho antigo, documentado no comment de AdventureZone.js). Este
// campo novo passa a ser um GATE de verdade: character.nivel precisa
// ser >= nivel_jogador_minimo da zona pra entrar (ver adventureService.
// entrarNaZona e partySocket "party:iniciar").
//
// Sem backfill de valor de propósito (pedido explícito, decisão de
// negócio de produção): toda zona nasce com nivel_jogador_minimo=1 (ou
// seja, SEM gate nenhum) até o Admin configurar cada uma manualmente
// pelo Painel — nunca herda nivel_monstro_min automaticamente. Em
// `dev` os valores de teste (1/6/11.../46) já foram configurados à mão
// depois que esta migration rodou; produção já está sendo configurada
// do mesmo jeito, separadamente — esta migration nunca deve sobrescrever
// isso.
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
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("AdventureZones", "nivel_jogador_minimo");
  },
};
