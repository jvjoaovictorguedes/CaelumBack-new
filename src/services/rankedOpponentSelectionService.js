// Seleção assíncrona de oponente ranqueado (PvP v2 §6).
//
// O CLIENTE NUNCA ESCOLHE. Esta função recebe só o id do desafiante
// (resolvido da sessão autenticada) e devolve um oponente elegível —
// qualquer alvo enviado na requisição é ignorado pelo controller antes
// de chegar aqui.
//
// Ordem exata da spec:
//   1. exclui o próprio desafiante;
//   2. filtra pro MESMO tier ou tier adjacente (±1, nunca expande);
//   3. exclui bloqueados pelo anti-rematch (§7);
//   4. ordena por proximidade de RATING;
//   5. proximidade de NÍVEL é só desempate/preferência, nunca filtro;
//   6. monta um pool com os N mais próximos;
//   7. sorteia um do pool.
// Sem candidato elegível → retorna null (e o controller NÃO consome
// tentativa diária).
const { Op } = require("sequelize");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const Character = require("../models/Character");
const rankedTierService = require("./rankedTierService");
const rankedAntifarmService = require("./rankedAntifarmService");
const { RANKED_TAMANHO_POOL_OPONENTES } = require("../config/rankedConfig");

async function selecionarOponente({
  idDesafiante,
  ratingDesafiante,
  nivelDesafiante,
  seasonId,
  dateKey,
}) {
  const meuTier = rankedTierService.tierDivisaoParaRating(ratingDesafiante);
  const faixa = rankedTierService.faixaRatingParaTiersAdjacentes(ratingDesafiante);
  const bloqueados = await rankedAntifarmService.oponentesBloqueadosHoje(idDesafiante, { dateKey });

  const where = {
    season_id: seasonId,
    character_id: { [Op.notIn]: [idDesafiante, ...bloqueados] },
    // Passo 2: a faixa de rating já cobre exatamente tier ± 1 (o último
    // tier é aberto, então Infinity vira "sem teto" — ver abaixo).
    rating: { [Op.gte]: faixa.min },
  };
  if (Number.isFinite(faixa.max)) {
    where.rating[Op.lte] = faixa.max;
  }

  const candidatos = await CharacterPvpSeason.findAll({
    where,
    include: [{ model: Character, as: "personagem", attributes: ["id", "nome", "nivel"] }],
    // Teto generoso só pra não carregar a temporada inteira num servidor
    // grande; a ordenação fina por proximidade acontece em memória
    // porque envolve |rating - meuRating|, que nenhum índice ajuda.
    limit: 500,
  });

  // Defensivo: a faixa de rating é derivada do tier, mas um rating
  // exatamente na fronteira de dois tiers adjacentes tem que resolver
  // pelo tier de verdade, não pela faixa numérica.
  const elegiveis = candidatos.filter((c) => {
    const tierDele = rankedTierService.tierDivisaoParaRating(c.rating);
    return rankedTierService.saoTiersAdjacentes(meuTier.tier, tierDele.tier);
  });

  if (elegiveis.length === 0) return null;

  // Passos 4 e 5: rating é o critério; nível só desempata.
  const ordenados = elegiveis
    .map((c) => ({
      participacao: c,
      distanciaRating: Math.abs(c.rating - ratingDesafiante),
      distanciaNivel: Math.abs((c.personagem?.nivel ?? 0) - (nivelDesafiante ?? 0)),
    }))
    .sort((a, b) => {
      if (a.distanciaRating !== b.distanciaRating) return a.distanciaRating - b.distanciaRating;
      if (a.distanciaNivel !== b.distanciaNivel) return a.distanciaNivel - b.distanciaNivel;
      return a.participacao.character_id - b.participacao.character_id;
    });

  // Passos 6 e 7: pool dos mais próximos + sorteio, pra não devolver
  // sempre o mesmo "vizinho de rating" nem cair em aleatório puro.
  const pool = ordenados.slice(0, RANKED_TAMANHO_POOL_OPONENTES);
  const escolhido = pool[Math.floor(Math.random() * pool.length)];
  const tierOponente = rankedTierService.tierDivisaoParaRating(escolhido.participacao.rating);

  return {
    characterId: escolhido.participacao.character_id,
    nome: escolhido.participacao.personagem?.nome ?? "???",
    nivel: escolhido.participacao.personagem?.nivel ?? null,
    rating: escolhido.participacao.rating,
    tier: tierOponente.tier,
    divisao: tierOponente.divisao,
    tierLabel: tierOponente.label,
    // §18 — o "porquê" da escolha vai pro log junto com o resultado.
    motivo: {
      tierDesafiante: meuTier.label,
      tiersPermitidos: faixa.tiers,
      candidatosElegiveis: elegiveis.length,
      bloqueadosPorAntiRematch: bloqueados.length,
      tamanhoPool: pool.length,
      distanciaRating: escolhido.distanciaRating,
      distanciaNivel: escolhido.distanciaNivel,
    },
  };
}

module.exports = { selecionarOponente };
