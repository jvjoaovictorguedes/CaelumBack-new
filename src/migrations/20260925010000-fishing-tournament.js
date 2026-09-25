"use strict";

// Torneio da Pesca — versão deliberadamente enxuta (ver relatório da
// sessão): sem tabela de "inscrição" nem de "entrada" própria. Um
// torneio é só uma janela de tempo (inicia_em..termina_em) opcionalmente
// restrita a uma zona; a pontuação é sempre MATERIALIZADA NA LEITURA a
// partir de fishing_catch_records (caught_at dentro da janela, e
// id_zone = escopo se houver escopo) — nenhuma escrita nova acontece no
// fluxo de captura, que já é transacional e testado (fishingService.js).
// Participação automática: qualquer captura durante a janela conta,
// sem botão de "entrar".
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("fishing_tournaments", {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      nome: { type: Sequelize.STRING(150), allowNull: false },
      id_zone: { type: Sequelize.INTEGER, allowNull: true },
      inicia_em: { type: Sequelize.DATE, allowNull: false },
      termina_em: { type: Sequelize.DATE, allowNull: false },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      id_admin_criador: { type: Sequelize.INTEGER, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
      updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("now") },
    });

    // Consultado toda vez que a tela de Pesca carrega (qual torneio está
    // ativo agora) — precisa de índice pela janela de tempo, não full scan.
    await queryInterface.addIndex("fishing_tournaments", ["ativo", "inicia_em", "termina_em"], {
      name: "fishing_tournaments_janela_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("fishing_tournaments");
  },
};
