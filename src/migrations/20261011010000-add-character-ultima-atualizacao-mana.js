"use strict";

// Base pra regeneração passiva de MANA (regenService), espelhando
// ultima_atualizacao_vida: guarda o instante em que mana_atual foi uma
// verdade conhecida pela última vez, pra calcular sob demanda quanto
// tempo real se passou e quanto regenerar — sem job/cron em segundo
// plano. Personagens existentes recebem NOW() como ponto de partida.
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable("Characters");
    if ("ultima_atualizacao_mana" in description) {
      console.log('[migration] "Characters"."ultima_atualizacao_mana" já existe — pulando.');
      return;
    }

    await queryInterface.addColumn("Characters", "ultima_atualizacao_mana", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE "Characters" SET ultima_atualizacao_mana = NOW() WHERE ultima_atualizacao_mana IS NULL;',
    );
    await queryInterface.changeColumn("Characters", "ultima_atualizacao_mana", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    });
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable("Characters");
    if ("ultima_atualizacao_mana" in description) {
      await queryInterface.removeColumn("Characters", "ultima_atualizacao_mana");
    }
  },
};
