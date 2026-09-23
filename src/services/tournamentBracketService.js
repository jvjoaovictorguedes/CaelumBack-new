// Chaveamento de torneio (PvP v2 §16).
//
// Sorteio 100% ALEATÓRIO (Fisher-Yates com Math.random): nenhuma
// semeadura por rating, nenhuma separação de "favoritos". O resultado é
// persistido UMA vez (tournaments.bracket_seed + participants.seed) e
// nunca regerado — reler o torneio sempre devolve o mesmo chaveamento,
// inclusive depois de um restart.
const {
  TAMANHOS_DE_CHAVE_VALIDOS,
  MIN_PARTICIPANTES_PARA_INICIAR,
  FORMATO_FINAL,
  FORMATO_PADRAO,
} = require("../config/tournamentConfig");

// Nome da PRIMEIRA rodada por tamanho de chave — 16 → Oitavas (8 séries),
// 8 → Quartas (4), 4 → Semifinal (2).
const PRIMEIRA_RODADA_POR_TAMANHO = { 4: "Semifinal", 8: "Quartas", 16: "Oitavas" };

// Rodadas vazias a criar ENTRE a primeira rodada e a Final, em ordem —
// cada uma com metade das séries da anterior. Semifinal nunca aparece
// aqui como vazia quando ela PRÓPRIA é a primeira rodada (tamanho 4).
const RODADAS_INTERMEDIARIAS_POR_PRIMEIRA = {
  Oitavas: ["Quartas", "Semifinal"],
  Quartas: ["Semifinal"],
  Semifinal: [],
};

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Menor tamanho de chave (4/8/16) que comporta `totalInscritos`, sobrando
// vagas pra "bye" (jogador sem oponente que avança direto — ver
// montarEstrutura). Não exige mais bater um número exato.
function calcularTamanhoDeChave(totalInscritos) {
  if (totalInscritos < MIN_PARTICIPANTES_PARA_INICIAR) {
    throw new Error(
      `Torneio precisa de pelo menos ${MIN_PARTICIPANTES_PARA_INICIAR} participantes para iniciar (tem ${totalInscritos}).`,
    );
  }
  const tamanho = TAMANHOS_DE_CHAVE_VALIDOS.find((t) => t >= totalInscritos);
  if (!tamanho) {
    const maiorFormato = TAMANHOS_DE_CHAVE_VALIDOS[TAMANHOS_DE_CHAVE_VALIDOS.length - 1];
    throw new Error(
      `Torneio tem participantes demais para o maior formato suportado (${maiorFormato}) — tem ${totalInscritos}.`,
    );
  }
  return tamanho;
}

// Mantido por compatibilidade — hoje só usado por quem quer checar se um
// NÚMERO é, em si, um tamanho de chave válido (4/8/16), não mais pra
// validar contagem de inscritos (que agora aceita qualquer valor >=
// MIN_PARTICIPANTES_PARA_INICIAR via calcularTamanhoDeChave).
function contagemValida(total) {
  return TAMANHOS_DE_CHAVE_VALIDOS.includes(total);
}

// Monta as séries da PRIMEIRA rodada a partir da ordem sorteada e do
// tamanho de chave escolhido (ver calcularTamanhoDeChave). Quando
// `totalReal` (inscritos de verdade) é menor que `tamanhoChave`, os
// primeiros `numByes` da ordem sorteada recebem "bye" — nascem SEM
// adversário (participant_b_id nulo) pra tournamentService.iniciar
// resolver como vitória automática assim que a série é criada. Como
// tamanhoChave é sempre o MENOR válido >= totalReal, numByes nunca passa
// de totalReal - 1 — ou seja, nunca sobra bye pra emparelhar com outro
// bye na mesma série.
//
// A Final (MD5) é sempre criada. O 3º lugar só é criado quando os dois
// lados da Semifinal vão de fato ser jogados: se a própria Semifinal é a
// primeira rodada (tamanho 4) e tem bye ali, não existe perdedor de
// semifinal nenhum pra disputar o 3º lugar (ver tournamentService.
// iniciar, resolução de bye) — formatos maiores nunca têm esse problema,
// porque bye só existe na primeira rodada, e pra eles a Semifinal sempre
// é alimentada por rodadas anteriores realmente jogadas.
function montarEstrutura(participantIdsEmbaralhados, tamanhoChave) {
  const totalReal = participantIdsEmbaralhados.length;
  const primeiraRodada = PRIMEIRA_RODADA_POR_TAMANHO[tamanhoChave];
  if (!primeiraRodada) {
    throw new Error(`Tamanho de chave não suportado: ${tamanhoChave}.`);
  }

  const numByes = tamanhoChave - totalReal;
  const comBye = participantIdsEmbaralhados.slice(0, numByes);
  const semBye = participantIdsEmbaralhados.slice(numByes);

  const series = [];
  let posicao = 0;
  for (const participantId of comBye) {
    series.push({
      round: primeiraRodada,
      posicao: posicao++,
      participant_a_id: participantId,
      participant_b_id: null,
      format: FORMATO_PADRAO,
    });
  }
  for (let i = 0; i < semBye.length; i += 2) {
    series.push({
      round: primeiraRodada,
      posicao: posicao++,
      participant_a_id: semBye[i],
      participant_b_id: semBye[i + 1],
      format: FORMATO_PADRAO,
    });
  }

  let seriesNaRodadaAnterior = series.length;
  for (const rodada of RODADAS_INTERMEDIARIAS_POR_PRIMEIRA[primeiraRodada]) {
    seriesNaRodadaAnterior = seriesNaRodadaAnterior / 2;
    for (let p = 0; p < seriesNaRodadaAnterior; p += 1) {
      series.push({
        round: rodada,
        posicao: p,
        participant_a_id: null,
        participant_b_id: null,
        format: FORMATO_PADRAO,
      });
    }
  }

  const semifinalTemBye = primeiraRodada === "Semifinal" && numByes > 0;
  if (!semifinalTemBye) {
    series.push({
      round: "TerceiroLugar",
      posicao: 0,
      participant_a_id: null,
      participant_b_id: null,
      format: FORMATO_PADRAO,
    });
  }
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
  const tamanhoChave = calcularTamanhoDeChave(participantIds.length);
  const ordem = embaralhar(participantIds);
  const { primeiraRodada, series } = montarEstrutura(ordem, tamanhoChave);
  return {
    bracketSeed: {
      ordem,
      total: ordem.length,
      tamanhoChave,
      primeiraRodada,
      sorteadoEm: new Date().toISOString(),
    },
    series,
  };
}

// Pra onde o vencedor de uma série avança. Retorna { round, posicao,
// lado } ou null (Final e 3º lugar não avançam).
function destinoDoVencedor(round, posicao) {
  if (round === "Oitavas") {
    return { round: "Quartas", posicao: Math.floor(posicao / 2), lado: posicao % 2 === 0 ? "a" : "b" };
  }
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
  calcularTamanhoDeChave,
  contagemValida,
  montarEstrutura,
  sortearChaveamento,
  destinoDoVencedor,
  destinoDoPerdedor,
};
