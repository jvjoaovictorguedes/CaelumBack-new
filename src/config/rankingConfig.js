// Configuração central do Ranking v2 (§10/§19 da spec) — paginação
// centralizada aqui, nunca espalhada pelos services/controllers. A aba
// PvP do ranking geral usa o rating/mínimo de partidas da Arena
// Ranqueada (rankedConfig.js) — o Duelo casual não tem pontuação própria
// nesse ranking.
const TAMANHO_PAGINA_PADRAO = 50;

module.exports = {
  TAMANHO_PAGINA_PADRAO,
};
