// src/services/rankService.js
//
// Escada de ranque compartilhada por personagem E guilda — F é o pior,
// S++ é o teto. Cada ranque (exceto S++) tem um Portal com um chefe de
// stats FIXOS (ver RankGate/GuildRankGate): pra subir, o personagem (ou
// a guilda, coletivamente) precisa derrotar o chefe do ranque atual.
// Não escala com quem tenta — fraco demais perde e não sobe até treinar
// o suficiente pra voltar e vencer.
const RANKS = ["F", "E", "D", "C", "B", "A", "S", "S+", "S++"];

function indiceDoRank(rank) {
  return RANKS.indexOf(rank);
}

// Devolve o próximo ranque da escada, ou null se já estiver no teto
// (S++) ou se `rank` for um valor desconhecido/corrompido.
function proximoRank(rank) {
  const indice = indiceDoRank(rank);
  if (indice === -1 || indice >= RANKS.length - 1) return null;
  return RANKS[indice + 1];
}

function ehRankValido(rank) {
  return indiceDoRank(rank) !== -1;
}

module.exports = { RANKS, indiceDoRank, proximoRank, ehRankValido };
