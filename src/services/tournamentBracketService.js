// Chaveamento de torneio (PvP v2 §16).
//
// Sorteio 100% ALEATÓRIO (Fisher-Yates com Math.random): nenhuma
// semeadura por rating, nenhuma separação de "favoritos". O resultado é
// persistido UMA vez (tournaments.bracket_seed + participants.seed) e
// nunca regerado — reler o torneio sempre devolve o mesmo chaveamento,
// inclusive depois de um restart.
const {
  CONTAGENS_VALIDAS_PARA_INICIAR,
  FORMATO_FINAL,
  FORMATO_PADRAO,
} = require("../config/tournamentConfig");

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function contagemValida(total) {
  return CONTAGENS_VALIDAS_PARA_INICIAR.includes(total);
}

// Monta as séries da PRIMEIRA rodada a partir da ordem sorteada.
// 8 inscritos → Quartas (4 séries MD3). 4 inscritos → Semifinal
// (2 séries MD3). A Final (MD5) e a série de 3º lugar (MD3) são criadas
// vazias e preenchidas conforme as rodadas resolvem.
function montarEstrutura(participantIdsEmbaralhados) {
  const total = participantIdsEmbaralhados.length;
  if (!contagemValida(total)) {
    throw new Error(
      `Torneio precisa de exatamente ${CONTAGENS_VALIDAS_PARA_INICIAR.join(" ou ")} participantes para iniciar (tem ${total}).`,
    );
  }

  const series = [];
  const primeiraRodada = total === 8 ? "Quartas" : "Semifinal";

  for (let i = 0; i < total; i += 2) {
    series.push({
      round: primeiraRodada,
      posicao: i / 2,
      participant_a_id: participantIdsEmbaralhados[i],
      participant_b_id: participantIdsEmbaralhados[i + 1],
      format: FORMATO_PADRAO,
    });
  }

  if (total === 8) {
    // Semifinais nascem vazias: os vencedores das quartas 0/1 e 2/3
    // caem, respectivamente, nas semis 0 e 1.
    for (let posicao = 0; posicao < 2; posicao += 1) {
      series.push({
        round: "Semifinal",
        posicao,
        participant_a_id: null,
        participant_b_id: null,
        format: FORMATO_PADRAO,
      });
    }
  }

  series.push({
    round: "TerceiroLugar",
    posicao: 0,
    participant_a_id: null,
    participant_b_id: null,
    format: FORMATO_PADRAO,
  });
  series.push({
    round: "Final",
    posicao: 0,
    participant_a_id: null,
    participant_b_id: null,
    format: FORMATO_FINAL,
  });

  return { primeiraRodada, series };
}

// Sorteia e devolve a estrutura + o "bracket_seed" a persistir. O seed
// é a ORDEM sorteada (ids de participante), que é o que permite auditar
// e reconstruir o chaveamento exatamente como foi gerado.
function sortearChaveamento(participantIds) {
  const ordem = embaralhar(participantIds);
  const { primeiraRodada, series } = montarEstrutura(ordem);
  return {
    bracketSeed: {
      ordem,
      total: ordem.length,
      primeiraRodada,
      sorteadoEm: new Date().toISOString(),
    },
    series,
  };
}

// Pra onde o vencedor de uma série avança. Retorna { round, posicao,
// lado } ou null (Final e 3º lugar não avançam).
function destinoDoVencedor(round, posicao) {
  if (round === "Quartas") {
    return { round: "Semifinal", posicao: Math.floor(posicao / 2), lado: posicao % 2 === 0 ? "a" : "b" };
  }
  if (round === "Semifinal") {
    return { round: "Final", posicao: 0, lado: posicao === 0 ? "a" : "b" };
  }
  return null;
}

// Perdedor de semifinal vai pro 3º lugar (§16).
function destinoDoPerdedor(round, posicao) {
  if (round === "Semifinal") {
    return { round: "TerceiroLugar", posicao: 0, lado: posicao === 0 ? "a" : "b" };
  }
  return null;
}

module.exports = {
  embaralhar,
  contagemValida,
  montarEstrutura,
  sortearChaveamento,
  destinoDoVencedor,
  destinoDoPerdedor,
};
