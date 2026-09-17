"use strict";

// Base pra regeneração passiva de vida (regenService): guarda o
// instante em que vida_atual foi uma verdade conhecida pela última
// vez, pra calcular sob demanda quanto tempo real se passou e quanto
// regenerar — sem precisar de job/cron rodando em segundo plano.
// Personagens existentes recebem NOW() como ponto de partida (não têm
// histórico de quando sua vida realmente mudou pela última vez, então
// o relógio da regeneração começa a contar a partir de agora).
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable("Characters");
    if ("ultima_atualizacao_vida" in description) {
      console.log('[migration] "Characters"."ultima_atualizacao_vida" já existe — pulando.');
      return;
    }

    await queryInterface.addColumn("Characters", "ultima_atualizacao_vida", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query(
      'UPDATE "Characters" SET ultima_atualizacao_vida = NOW() WHERE ultima_atualizacao_vida IS NULL;',
    );
    await queryInterface.changeColumn("Characters", "ultima_atualizacao_vida", {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW,
    });
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable("Characters");
    if ("ultima_atualizacao_vida" in description) {
      await queryInterface.removeColumn("Characters", "ultima_atualizacao_vida");
    }
  },
};
