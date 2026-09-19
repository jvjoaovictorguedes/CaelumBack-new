// Rating Elo da Arena Ranqueada (PvP Competitivo v1, §5). Cálculo
// sempre no servidor, após resultado oficial — nenhum client nunca
// envia vencedor ou delta de rating (§10).
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const {
  RATING_INICIAL,
  RATING_MINIMO,
  ELO_K_PLACEMENT,
  ELO_K_NORMAL,
  PARTIDAS_PLACEMENT,
  LIGAS,
  FATOR_SOFT_RESET,
} = require("../config/rankedConfig");

function calcularExpected(ratingJogador, ratingOponente) {
  return 1 / (1 + 10 ** ((ratingOponente - ratingJogador) / 400));
}

// K maior nas primeiras PARTIDAS_PLACEMENT partidas RANQUEADAS da
// temporada do jogador (§5/§8) — placement não é secreto, só usa K
// maior; `jogosJaJogados` é a contagem ANTES da partida atual.
function kParaJogos(jogosJaJogados) {
  return jogosJaJogados < PARTIDAS_PLACEMENT ? ELO_K_PLACEMENT : ELO_K_NORMAL;
}

// Arredondamento determinístico (§5): sempre Math.round, nunca floor/
// ceil variando por sinal — e nunca abaixo do piso de rating.
function calcularNovoRating(rating, expected, resultado, k) {
  const bruto = rating + k * (resultado - expected);
  return Math.max(RATING_MINIMO, Math.round(bruto));
}

function ligaParaRating(rating) {
  const liga = LIGAS.find((l) => rating >= l.min && rating <= l.max);
  return liga ? liga.nome : LIGAS[0].nome;
}

async function obterOuCriarParticipacao(characterId, seasonId, transaction) {
  const [participacao] = await CharacterPvpSeason.findOrCreate({
    where: { character_id: characterId, season_id: seasonId },
    defaults: {
      character_id: characterId,
      season_id: seasonId,
      rating: RATING_INICIAL,
      jogos: 0,
      vitorias: 0,
      derrotas: 0,
      peak_rating: RATING_INICIAL,
    },
    transaction,
  });
  return participacao;
}

// Aplica o resultado oficial de uma partida ranqueada: carrega (ou cria)
// a participação sazonal dos dois jogadores, calcula o novo rating de
// cada um via Elo e persiste. Retorna rating antes/depois dos dois —
// usado tanto pra persistir em RankedMatch (§16) quanto pro evento
// ranked:rating:update.
async function aplicarResultadoRanked({ idVencedor, idPerdedor, seasonId, transaction }) {
  const participacaoVencedor = await obterOuCriarParticipacao(idVencedor, seasonId, transaction);
  const participacaoPerdedor = await obterOuCriarParticipacao(idPerdedor, seasonId, transaction);

  const ratingVencedorAntes = participacaoVencedor.rating;
  const ratingPerdedorAntes = participacaoPerdedor.rating;

  const expectedVencedor = calcularExpected(ratingVencedorAntes, ratingPerdedorAntes);
  const expectedPerdedor = calcularExpected(ratingPerdedorAntes, ratingVencedorAntes);

  const kVencedor = kParaJogos(participacaoVencedor.jogos);
  const kPerdedor = kParaJogos(participacaoPerdedor.jogos);

  const ratingVencedorDepois = calcularNovoRating(ratingVencedorAntes, expectedVencedor, 1, kVencedor);
  const ratingPerdedorDepois = calcularNovoRating(ratingPerdedorAntes, expectedPerdedor, 0, kPerdedor);

  await participacaoVencedor.update(
    {
      rating: ratingVencedorDepois,
      jogos: participacaoVencedor.jogos + 1,
      vitorias: participacaoVencedor.vitorias + 1,
      peak_rating: Math.max(participacaoVencedor.peak_rating, ratingVencedorDepois),
    },
    { transaction },
  );

  await participacaoPerdedor.update(
    {
      rating: ratingPerdedorDepois,
      jogos: participacaoPerdedor.jogos + 1,
      derrotas: participacaoPerdedor.derrotas + 1,
      peak_rating: Math.max(participacaoPerdedor.peak_rating, ratingPerdedorDepois),
    },
    { transaction },
  );

  return {
    ratingVencedorAntes,
    ratingVencedorDepois,
    ratingPerdedorAntes,
    ratingPerdedorDepois,
  };
}

// §12 — soft reset no início da temporada seguinte, em direção a 1000.
function softReset(ratingFinal) {
  return Math.round(RATING_INICIAL + (ratingFinal - RATING_INICIAL) * FATOR_SOFT_RESET);
}

module.exports = {
  calcularExpected,
  calcularNovoRating,
  kParaJogos,
  ligaParaRating,
  obterOuCriarParticipacao,
  aplicarResultadoRanked,
  softReset,
};
