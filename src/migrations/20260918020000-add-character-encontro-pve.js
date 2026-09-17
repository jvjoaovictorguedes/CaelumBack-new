"use strict";

// Persiste o combate PvE ativo do personagem no banco em vez de só em
// memória do processo (ver comentário em combatController.js) — sem
// isso, qualquer restart/redeploy do servidor apagava o inimigo que o
// jogador estava enfrentando no meio da luta, e o próximo clique de
// ataque caía num "Nenhum combate ativo" mesmo o jogador tendo acabado
// de ver o inimigo aparecer na tela.
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable("Characters");
    if ("encontro_pve" in description) {
      console.log('[migration] "Characters"."encontro_pve" já existe — pulando.');
      return;
    }

    await queryInterface.addColumn("Characters", "encontro_pve", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable("Characters");
    if ("encontro_pve" in description) {
      await queryInterface.removeColumn("Characters", "encontro_pve");
    }
  },
};
