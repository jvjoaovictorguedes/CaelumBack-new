"use strict";

// Evolução de CLASSE — não confundir com o sistema de Evolution já
// existente (que é por NATUREZA MÁGICA, gated por nível+ouro). Esta é um
// upgrade único e definitivo da classe em si, só alcançável em nível
// alto e consumindo uma relíquia específica (ver classEvolutionService.js)
// — dá um título novo de exibição e um bônus permanente nos
// multiplicadores de classe.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");
    if (!("classe_evoluida" in descricao)) {
      await queryInterface.addColumn("Characters", "classe_evoluida", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("Characters");
    if ("classe_evoluida" in descricao) {
      await queryInterface.removeColumn("Characters", "classe_evoluida");
    }
  },
};
