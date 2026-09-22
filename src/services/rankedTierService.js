// Tier + Divisão da Arena Ranqueada v2 (§4/§5/§6).
//
// Nada aqui é persistido: Tier e Divisão são SEMPRE derivados do rating
// atual. Isso mantém promoção/rebaixamento automáticos (cruzar a
// fronteira de rating já muda o tier na próxima leitura) e impede que
// uma coluna de tier fique dessincronizada do rating.
//
// Mantido separado do rankedRatingService porque ele é puro (nenhum
// acesso a banco) e é consumido por controllers, matchmaking, IA e
// testes — o rating service faz I/O e transação.
const {
  TIERS,
  RANKED_RATING_DELTAS,
  RATING_MINIMO,
} = require("../config/rankedConfig");

// Rating → { tier, divisao, ordem, asset, label, min, max }.
// Abaixo do piso cai em Ferro IV; acima do teto cai em Mestre.
function tierDivisaoParaRating(rating) {
  const valor = Number.isFinite(rating) ? rating : RATING_MINIMO;

  for (const tier of TIERS) {
    for (const faixa of tier.divisoes) {
      if (valor >= faixa.min && valor <= faixa.max) {
        return {
          tier: tier.nome,
          divisao: faixa.divisao,
          ordem: tier.ordem,
          asset: tier.asset,
          label: faixa.divisao ? `${tier.nome} ${faixa.divisao}` : tier.nome,
          min: faixa.min,
          max: faixa.max,
        };
      }
    }
  }

  // Só alcançável com rating negativo (o piso de rating é 0, mas
  // defensivo): trata como o tier mais baixo.
  const primeiro = TIERS[0];
  const faixa = primeiro.divisoes[0];
  return {
    tier: primeiro.nome,
    divisao: faixa.divisao,
    ordem: primeiro.ordem,
    asset: primeiro.asset,
    label: `${primeiro.nome} ${faixa.divisao}`,
    min: faixa.min,
    max: faixa.max,
  };
}

// §4 — chave de asset estável por Tier. O cliente NUNCA manda um
// caminho de imagem: ele recebe esta chave e resolve localmente.
function tierParaAsset(tier) {
  const encontrado = TIERS.find((t) => t.nome === tier);
  return encontrado ? encontrado.asset : TIERS[0].asset;
}

function tierPorNome(nome) {
  return TIERS.find((t) => t.nome === nome) ?? null;
}

// §6 — adjacência linear Ferro↔Bronze↔…↔Mestre, SEMPRE ±1, nunca
// expandida mesmo sem candidatos.
function tiersAdjacentes(tier) {
  const base = tierPorNome(tier);
  if (!base) return [TIERS[0].nome];
  return TIERS.filter((t) => Math.abs(t.ordem - base.ordem) <= 1).map((t) => t.nome);
}

function saoTiersAdjacentes(tierA, tierB) {
  return tiersAdjacentes(tierA).includes(tierB);
}

// Faixa de rating [min, max] que cobre o tier do jogador e os
// adjacentes — usada pra filtrar candidatos direto no SQL em vez de
// carregar a tabela inteira e filtrar em memória.
function faixaRatingParaTiersAdjacentes(rating) {
  const atual = tierDivisaoParaRating(rating);
  const nomes = tiersAdjacentes(atual.tier);
  const tiers = nomes.map(tierPorNome).filter(Boolean);
  const min = Math.min(...tiers.map((t) => t.divisoes[0].min));
  const max = Math.max(...tiers.map((t) => t.divisoes[t.divisoes.length - 1].max));
  return { min, max, tiers: nomes };
}

// §5 — delta aplicado SÓ ao desafiante humano, por diferença de Tier.
// `venceu` booleano; retorna um inteiro (positivo ou negativo).
function deltaRating({ ratingJogador, ratingOponente, venceu }) {
  const meu = tierDivisaoParaRating(ratingJogador);
  const dele = tierDivisaoParaRating(ratingOponente);
  const diff = dele.ordem - meu.ordem;

  let faixa;
  if (diff > 0) faixa = RANKED_RATING_DELTAS.oponenteAcima;
  else if (diff < 0) faixa = RANKED_RATING_DELTAS.oponenteAbaixo;
  else faixa = RANKED_RATING_DELTAS.mesmoTier;

  return venceu ? faixa.vitoria : faixa.derrota;
}

// Aplica o delta respeitando o piso de rating.
function aplicarDelta(rating, delta) {
  return Math.max(RATING_MINIMO, rating + delta);
}

// Resumo pronto pra API/log — um lugar só monta o objeto de tier.
function resumoTier(rating) {
  const t = tierDivisaoParaRating(rating);
  return {
    rating,
    tier: t.tier,
    divisao: t.divisao,
    tierLabel: t.label,
    tierAsset: t.asset,
  };
}

module.exports = {
  tierDivisaoParaRating,
  tierParaAsset,
  tierPorNome,
  tiersAdjacentes,
  saoTiersAdjacentes,
  faixaRatingParaTiersAdjacentes,
  deltaRating,
  aplicarDelta,
  resumoTier,
};
