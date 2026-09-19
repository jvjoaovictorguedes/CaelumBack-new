// Anti-farm específico da Arena Ranqueada (§10). Como o oponente é
// escolhido pelo SERVIDOR (nunca por escolha direta do jogador), a
// maior parte do exploit que o pvpAntifarmService.js cobre pro duelo
// casual (par combinado se desafiando direto) já não se aplica aqui —
// o que sobra é: rematch consecutivo do mesmo par quando havia
// alternativa na fila. Mantido em memória (histórico recente por
// jogador) pra o predicado de pareamento continuar síncrono — nunca
// bate no banco dentro do tick do matchmaking.
const { RANKED_MAX_REMATCHES_CONSECUTIVOS } = require("../config/rankedConfig");

// characterId -> array dos últimos oponentes, mais recente primeiro,
// limitado a RANKED_MAX_REMATCHES_CONSECUTIVOS entradas.
const historicoRecente = new Map();

function registrarResultado(idA, idB) {
  for (const [id, oponente] of [
    [idA, idB],
    [idB, idA],
  ]) {
    const historico = historicoRecente.get(id) ?? [];
    historico.unshift(oponente);
    historicoRecente.set(id, historico.slice(0, RANKED_MAX_REMATCHES_CONSECUTIVOS));
  }
}

function rematchesConsecutivos(idJogador, idOponente) {
  const historico = historicoRecente.get(idJogador) ?? [];
  if (historico.length < RANKED_MAX_REMATCHES_CONSECUTIVOS) return false;
  return historico.every((oponente) => oponente === idOponente);
}

// Predicado usado pelo rankedMatchmakingService._tick (assinatura
// síncrona: idA, idB, tamanhoFilaNoMomento). Só bloqueia o rematch
// consecutivo quando existem outros candidatos na fila além desse par
// (§10 — "quando houver alternativas"); se só sobrou esse par, deixa
// parear em vez de travar a fila indefinidamente.
function podeParear(idA, idB, tamanhoFilaNoMomento) {
  const haAlternativas = tamanhoFilaNoMomento > 2;
  if (!haAlternativas) return true;

  if (rematchesConsecutivos(idA, idB) || rematchesConsecutivos(idB, idA)) {
    return false;
  }
  return true;
}

function limparHistorico(characterId) {
  historicoRecente.delete(characterId);
}

module.exports = {
  registrarResultado,
  rematchesConsecutivos,
  podeParear,
  limparHistorico,
};
