"use strict";

// Fila: notificação de mural até o player abrir — precisa saber quando
// cada membro viu o Mural pela última vez, pra comparar contra a
// mensagem mais recente e decidir se mostra o indicador de "não lido".
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("GuildMembers", "mural_ultima_leitura_em", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("GuildMembers", "mural_ultima_leitura_em");
  },
};
