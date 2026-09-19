"use strict";

// Ranking v2 (§6/§23/§24 da spec) — Ranking de Gold usa ouro TOTAL já
// ganho, não o saldo atual (senão punia quem gasta em Forja/Mercado/
// equipamento). Sem histórico anterior pra reconstruir de verdade, o
// backfill assume dinheiro_total_ganho = dinheiro atual pra quem já
// existe — aproximação intencional e documentada (subestima quem já
// gastou), só o suficiente pra não nascer todo mundo em 0. Dali em
// diante, todo crédito passa por goldService.concederOuro (nunca por
// `character.dinheiro +=` direto), que mantém as duas colunas
// consistentes.
module.exports = {
  async up(queryInterface, Sequelize) {
    const descricao = await queryInterface.describeTable("Characters");
    if (!descricao.dinheiro_total_ganho) {
      await queryInterface.addColumn("Characters", "dinheiro_total_ganho", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });

      await queryInterface.sequelize.query(
        `UPDATE "Characters" SET dinheiro_total_ganho = GREATEST(dinheiro, 0);`,
      );
    }

    // §24 — índices pros campos usados na ordenação dos rankings.
    async function garantirIndice(tabela, campos, nome) {
      const existentes = await queryInterface.sequelize.query(
        `SELECT indexname FROM pg_indexes WHERE tablename = :tabela AND indexname = :nome;`,
        { replacements: { tabela, nome } },
      );
      if (existentes[0].length > 0) return;
      await queryInterface.addIndex(tabela, campos, { name: nome });
    }

    await garantirIndice("Characters", ["nivel", "experiencia"], "characters_nivel_experiencia_idx");
    await garantirIndice("Characters", ["dinheiro_total_ganho"], "characters_dinheiro_total_ganho_idx");
    await garantirIndice("Guilds", ["experiencia"], "guilds_experiencia_idx");
    await garantirIndice("character_forge_progress", ["experiencia"], "character_forge_progress_experiencia_idx");
    await garantirIndice("PvpStatuses", ["total_batalhas", "vitorias", "derrotas"], "pvp_statuses_ranking_idx");
  },

  async down(queryInterface) {
    const descricao = await queryInterface.describeTable("Characters");
    if (descricao.dinheiro_total_ganho) {
      await queryInterface.removeColumn("Characters", "dinheiro_total_ganho");
    }
    await queryInterface.removeIndex("Characters", "characters_nivel_experiencia_idx").catch(() => {});
    await queryInterface.removeIndex("Guilds", "guilds_experiencia_idx").catch(() => {});
    await queryInterface
      .removeIndex("character_forge_progress", "character_forge_progress_experiencia_idx")
      .catch(() => {});
    await queryInterface.removeIndex("PvpStatuses", "pvp_statuses_ranking_idx").catch(() => {});
  },
};
