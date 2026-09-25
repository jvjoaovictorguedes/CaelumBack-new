"use strict";

// PvP Ranqueado — bug real reportado: "rank não contabiliza". Causa raiz:
// rankedSeasonService.obterOuIniciarTemporadaAtiva() lê "existe temporada
// Ativa?" e, se não, cria uma — tudo dentro de uma transação, mas SEM lock
// nenhum. Duas requisições concorrentes (dois jogadores abrindo
// /dashboard/pvp ao mesmo tempo logo após um deploy, ou bem no instante em
// que uma temporada de 14 dias vira) podem cada uma ver "nenhuma Ativa"
// ANTES da outra commitar a sua, e as duas criam uma temporada nova — duas
// linhas com status='Ativa' ao mesmo tempo. Dali em diante, GET
// /pvp/ranked/status e POST /pvp/ranked/match/start podem resolver pra
// temporadas "Ativa" DIFERENTES dependendo de qual delas tem o maior id no
// momento da leitura (obterTemporadaAtiva ordena por id DESC) — partidas
// registram rating numa season_id, o perfil lê participação de outra, e o
// jogador vê o rating sempre voltando pro mesmo valor (participação nova,
// 1000) mesmo ganhando partidas de verdade.
//
// Este patch tem duas pernas, e as duas são necessárias:
//   1) Aqui (migration): garante a nível de BANCO que nunca existam duas
//      linhas 'Ativa' ao mesmo tempo — índice único parcial. Antes de
//      criar o índice, reconcilia qualquer duplicata que já exista hoje
//      (mantém a de maior id como Ativa, encerra as outras).
//   2) rankedSeasonService.js: serializa quem tenta fazer bootstrap da
//      temporada com um advisory lock, pra nunca mais bater nesse índice
//      por erro em uso normal (o índice aqui é a rede de segurança final,
//      não o mecanismo principal).
module.exports = {
  async up(queryInterface) {
    const [duplicadas] = await queryInterface.sequelize.query(
      `SELECT id FROM pvp_seasons WHERE status = 'Ativa' ORDER BY id DESC;`,
    );
    if (duplicadas.length > 1) {
      const [maisRecente, ...resto] = duplicadas;
      console.log(
        `[migration] ${duplicadas.length} temporadas 'Ativa' simultâneas encontradas — mantendo id=${maisRecente.id}, encerrando: ${resto.map((r) => r.id).join(", ")}.`,
      );
      await queryInterface.sequelize.query(
        `UPDATE pvp_seasons SET status = 'Encerrada', "updatedAt" = now() WHERE id IN (:ids);`,
        { replacements: { ids: resto.map((r) => r.id) } },
      );
    }

    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX pvp_seasons_uma_ativa_idx ON pvp_seasons (status) WHERE status = 'Ativa';`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS pvp_seasons_uma_ativa_idx;`);
  },
};
