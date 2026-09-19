"use strict";

// Remove o Portal de Ranque INDIVIDUAL (pedido do jogador) — o Rank do
// personagem (Character.rank) passa a ser definido só pelas promoções
// da Guilda dos Aventureiros (ver adventureGuildProgressionService.js).
// O Portal de Ranque COLETIVO da guilda (guild_rank_gates/
// GuildRankGate/guild_gate_attempts, guildGateController.js) é outro
// sistema — não é tocado aqui.
//
// rank_gates guardava só os chefes fixos por ranque do portal
// individual; nenhuma outra feature referencia essa tabela.
// pontos_portal_atual/ultima_tentativa_rank_gate/ultima_vitoria_rank_gate/
// encontro_rank_gate só existiam pro portal individual.
//
// Character.rank é resetado pra 'F' em todo mundo (pedido explícito)
// — de agora em diante só sobe via Provação da Guilda dos Aventureiros.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`UPDATE "Characters" SET rank = 'F';`);

    const tabelas = await queryInterface.showAllTables();
    if (tabelas.includes("rank_gates")) {
      await queryInterface.dropTable("rank_gates");
    }

    const descricao = await queryInterface.describeTable("Characters");
    for (const coluna of [
      "pontos_portal_atual",
      "ultima_tentativa_rank_gate",
      "ultima_vitoria_rank_gate",
      "encontro_rank_gate",
    ]) {
      if (descricao[coluna]) {
        await queryInterface.removeColumn("Characters", coluna);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");
    if (!descricao.pontos_portal_atual) {
      await queryInterface.addColumn("Characters", "pontos_portal_atual", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!descricao.ultima_tentativa_rank_gate) {
      await queryInterface.addColumn("Characters", "ultima_tentativa_rank_gate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!descricao.ultima_vitoria_rank_gate) {
      await queryInterface.addColumn("Characters", "ultima_vitoria_rank_gate", {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!descricao.encontro_rank_gate) {
      await queryInterface.addColumn("Characters", "encontro_rank_gate", {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }
    // rank_gates não é recriada — o catálogo de chefes por ranque não
    // é reconstruível a partir de nada, ver seed original
    // (20260919060000-seed-rank-gates.js) se precisar recriar os dados.
  },
};
