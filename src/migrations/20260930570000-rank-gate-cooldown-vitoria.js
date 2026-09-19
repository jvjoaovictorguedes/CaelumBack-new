"use strict";

// Auditoria de economia (pedido do jogador): vencer o Portal de Ranque
// nunca aplicava cooldown nenhum — só ultima_tentativa_rank_gate
// (derrota) existia. Um personagem capaz de vencer o próprio ranque
// conseguia encadear vitórias sem NENHUM intervalo, e Muito Difícil no
// ranque S+ paga até 44.000 de ouro de uma vez — de graça, num loop sem
// fim. Essa era de longe a maior fonte de inflação do jogo. Este campo
// novo guarda quando foi a ÚLTIMA VITÓRIA (separado da derrota, que
// continua com os 5 minutos de sempre) pra aplicar um cooldown curto
// (60s, ver COOLDOWN_VITORIA_MS em rankGateController.js) sem punir
// pesado quem só quer jogar.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");
    if (!descricao.ultima_vitoria_rank_gate) {
      await queryInterface.addColumn("Characters", "ultima_vitoria_rank_gate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("Characters");
    if (descricao.ultima_vitoria_rank_gate) {
      await queryInterface.removeColumn("Characters", "ultima_vitoria_rank_gate");
    }
  },
};
