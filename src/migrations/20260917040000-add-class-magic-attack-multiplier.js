"use strict";

// Fecha o quarto multiplicador de identidade de classe: guerreiro/mago já
// tinham vida, mana e dano físico por nível — faltava o dano mágico (poderes),
// que até aqui escalava só por inteligência e pelo valor_escala do próprio
// poder, igual pra qualquer classe. Guerreiro usando poder deveria ser bem
// mais fraco nisso que o Mago, o mesmo espelho que já existe pro físico.
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable("Classes");
    if (!("multiplicador_dano_magico" in description)) {
      await queryInterface.addColumn("Classes", "multiplicador_dano_magico", {
        type: Sequelize.FLOAT,
        defaultValue: 1.0,
        allowNull: false,
      });
    } else {
      console.log('[migration] "Classes"."multiplicador_dano_magico" já existe — pulando criação da coluna.');
    }

    // Espelha o multiplicador físico: Guerreiro fraco em poder, Mago forte.
    await queryInterface.sequelize.query(`
      UPDATE "Classes" SET multiplicador_dano_magico = 0.6 WHERE nome ILIKE '%guerreiro%';
      UPDATE "Classes" SET multiplicador_dano_magico = 1.3 WHERE nome ILIKE '%mago%';
    `);
  },

  async down(queryInterface) {
    const description = await queryInterface.describeTable("Classes");
    if ("multiplicador_dano_magico" in description) {
      await queryInterface.removeColumn("Classes", "multiplicador_dano_magico");
    }
  },
};
