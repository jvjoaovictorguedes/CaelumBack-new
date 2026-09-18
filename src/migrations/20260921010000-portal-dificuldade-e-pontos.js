"use strict";

// Portal de Ranque vira combate interativo (turno a turno, com escolha
// de dificuldade) em vez de resolver tudo numa tacada só — precisa de
// um lugar pra guardar o combate em andamento (igual encontro_pve) e um
// contador de progresso (vencer no Fácil não te promove numa luta só;
// ver rankGateService.js).
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");

    if (!("encontro_rank_gate" in descricao)) {
      await queryInterface.addColumn("Characters", "encontro_rank_gate", {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }

    if (!("pontos_portal_atual" in descricao)) {
      await queryInterface.addColumn("Characters", "pontos_portal_atual", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("Characters");
    if ("encontro_rank_gate" in descricao) {
      await queryInterface.removeColumn("Characters", "encontro_rank_gate");
    }
    if ("pontos_portal_atual" in descricao) {
      await queryInterface.removeColumn("Characters", "pontos_portal_atual");
    }
  },
};
