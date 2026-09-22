// Rating da Arena Ranqueada v2 (§5/§8/§12/§13).
//
// O cálculo Elo por valor esperado da v1 FOI REMOVIDO: agora o delta é
// fixo por diferença de Tier (rankedTierService.deltaRating) e só o
// DESAFIANTE humano tem rating alterado — o defensor assíncrono é um
// snapshot controlado por IA e nunca perde/ganha nada (§8).
//
// Nenhum client envia vencedor ou delta: tudo é calculado aqui, no
// servidor, a partir do resultado oficial do duelo.
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const rankedTierService = require("./rankedTierService");
const {
  RATING_INICIAL,
  RATING_MINIMO,
  SOFT_RESET_FATOR_BASE,
  SOFT_RESET_AJUSTE_MAXIMO,
  SOFT_RESET_ESCALA_WINRATE,
  SOFT_RESET_JOGOS_AMOSTRA_CHEIA,
} = require("../config/rankedConfig");

// Compat: vários pontos antigos pediam só o nome da "liga". Agora é o
// rótulo completo de Tier+Divisão (ex.: "Bronze IV").
function ligaParaRating(rating) {
  return rankedTierService.tierDivisaoParaRating(rating).label;
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

// §5/§8 — aplica o resultado de uma partida ranqueada ASSÍNCRONA.
// Só o desafiante é tocado; `ratingOponente` entra apenas no cálculo da
// diferença de Tier e é persistido em RankedMatch como snapshot de
// auditoria (§11), nunca escrito de volta no CharacterPvpSeason dele.
//
// Precisa rodar DENTRO da transação de finalização (§12).
async function aplicarResultadoDesafiante({
  idDesafiante,
  seasonId,
  ratingOponente,
  venceu,
  transaction,
}) {
  const participacao = await obterOuCriarParticipacao(idDesafiante, seasonId, transaction);

  const ratingAntes = participacao.rating;
  const delta = rankedTierService.deltaRating({
    ratingJogador: ratingAntes,
    ratingOponente,
    venceu,
  });
  const ratingDepois = rankedTierService.aplicarDelta(ratingAntes, delta);

  await participacao.update(
    {
      rating: ratingDepois,
      jogos: participacao.jogos + 1,
      vitorias: participacao.vitorias + (venceu ? 1 : 0),
      derrotas: participacao.derrotas + (venceu ? 0 : 1),
      peak_rating: Math.max(participacao.peak_rating, ratingDepois),
    },
    { transaction },
  );

  return {
    ratingAntes,
    ratingDepois,
    // O delta EFETIVO pode ser menor que o teórico quando o piso de
    // rating (0) corta a perda — é esse que vai pro log/API.
    delta: ratingDepois - ratingAntes,
    deltaTeorico: delta,
    tierAntes: rankedTierService.tierDivisaoParaRating(ratingAntes),
    tierDepois: rankedTierService.tierDivisaoParaRating(ratingDepois),
  };
}

// §13 — soft reset no início da próxima temporada.
//
//   Base        = 1000 + (RatingFinal - 1000) × 0,80
//   WinRate     = Vitórias / Jogos (0 quando Jogos = 0)
//   AjusteBruto = clamp((WinRate - 0,50) × 300, -60, +60)
//   FatorAmostra= min(1, Jogos / 10)
//   AjusteFinal = round(AjusteBruto × FatorAmostra)
//   NovoRating  = max(0, round(Base + AjusteFinal))
//
// Exemplo da spec: 1800 / 60% / 20 jogos → 1670.
function softReset(ratingFinal, { jogos = 0, vitorias = 0 } = {}) {
  const base = RATING_INICIAL + (ratingFinal - RATING_INICIAL) * SOFT_RESET_FATOR_BASE;
  const winRate = jogos > 0 ? vitorias / jogos : 0;
  const ajusteBruto = Math.min(
    SOFT_RESET_AJUSTE_MAXIMO,
    Math.max(-SOFT_RESET_AJUSTE_MAXIMO, (winRate - 0.5) * SOFT_RESET_ESCALA_WINRATE),
  );
  const fatorAmostra = Math.min(1, jogos / SOFT_RESET_JOGOS_AMOSTRA_CHEIA);
  const ajusteFinal = Math.round(ajusteBruto * fatorAmostra);
  return Math.max(RATING_MINIMO, Math.round(base + ajusteFinal));
}

module.exports = {
  ligaParaRating,
  obterOuCriarParticipacao,
  aplicarResultadoDesafiante,
  softReset,
};
