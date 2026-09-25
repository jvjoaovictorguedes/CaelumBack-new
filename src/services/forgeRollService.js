// Sorteios da Forja v3 — sempre crypto.randomInt (mesmo critério de todo
// sorteio do jogo que "vale a pena tentar prever/manipular": drop,
// expedição, refinamento de habilidade).
const crypto = require("crypto");
const forgeConfig = require("../config/forgeConfig");
const {
  ORDEM_QUALIDADE,
  CHANCE_BARRA_BONUS_PPM_POR_NIVEL,
  CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL,
  CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO,
  BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL,
  REFINAMENTOS_GARANTIDOS,
} = forgeConfig;
// CAP_CHANCE_REFINAMENTO_PPM fica de fora da desestruturação acima DE
// PROPÓSITO — é editável via Painel Administrativo §9 (forge.balance),
// e forgeConfig.aplicarOverridesBalanceamento muta essa propriedade no
// objeto exportado (nunca reatribui o módulo inteiro); lendo por
// property access aqui (forgeConfig.CAP_CHANCE_REFINAMENTO_PPM, sempre
// no MOMENTO do cálculo) é o que faz uma mudança de balanceamento
// valer pro próximo refinamento sem precisar reiniciar o servidor.

const BASE_SORTEIO = 1_000_000;

// true = essa barra-base rendeu +1 extra (rolado POR BARRA, nunca em
// lote — spec §8: dividir/juntar lotes não pode mudar a chance efetiva).
function rolarBarraBonus(nivelForja) {
  const chancePpm = CHANCE_BARRA_BONUS_PPM_POR_NIVEL[nivelForja] ?? 0;
  return crypto.randomInt(0, BASE_SORTEIO) < chancePpm;
}

// Retorna quantos degraus ACIMA da qualidade-base o resultado da
// Fabricação ficou (0 = mesma qualidade dos materiais).
//
// `bonusForjaGuildaPontosPercentuais` (Buff de Forja da Guilda, spec
// "Aprimoramento do Sistema de Guildas" §21/§22) retira chance SÓ do
// resultado "mesma qualidade" (a fatia implícita = BASE_SORTEIO menos a
// soma de mais1..mais5) e transfere pra "+1" — nunca mexe em
// mais2/mais3/mais4/mais5, e nunca deixa "mesma qualidade" ir negativa.
function rolarDegrausQualidadeSuperior(nivelForja, bonusForjaGuildaPontosPercentuais = 0) {
  const chancesBase = CHANCE_QUALIDADE_SUPERIOR_FABRICACAO_PPM_POR_NIVEL[nivelForja];
  if (!chancesBase) throw new Error(`Sem tabela de chance de fabricação pro nível de Forja ${nivelForja}.`);

  const chances = { ...chancesBase };
  if (bonusForjaGuildaPontosPercentuais > 0) {
    const somaDegraus = ["mais1", "mais2", "mais3", "mais4", "mais5"].reduce(
      (soma, chave) => soma + (chancesBase[chave] ?? 0),
      0,
    );
    const mesmaQualidadePpm = BASE_SORTEIO - somaDegraus;
    const bonusPpm = Math.min(
      mesmaQualidadePpm,
      Math.round((bonusForjaGuildaPontosPercentuais / 100) * BASE_SORTEIO),
    );
    chances.mais1 = (chances.mais1 ?? 0) + bonusPpm;
  }

  const sorteio = crypto.randomInt(0, BASE_SORTEIO);
  let acumulado = 0;
  // Do maior degrau pro menor — mesma lógica de "checar o mais raro
  // primeiro" do sorteio da Expedição, pra faixa pequena não ser
  // engolida por engano dentro da faixa grande de "mesma qualidade".
  const ordem = ["mais5", "mais4", "mais3", "mais2", "mais1"];
  for (const chave of ordem) {
    acumulado += chances[chave] ?? 0;
    if (sorteio < acumulado) return Number(chave.replace("mais", ""));
  }
  return 0;
}

function qualidadeComDegraus(qualidadeBase, degraus) {
  const indiceBase = ORDEM_QUALIDADE.indexOf(qualidadeBase);
  const indiceFinal = Math.min(ORDEM_QUALIDADE.length - 1, indiceBase + degraus);
  return ORDEM_QUALIDADE[indiceFinal];
}

// Chance final de sucesso do refinamento — nunca aceitar chance vinda do
// cliente (spec §54): sempre recalculada aqui a partir de dados do
// servidor (nível de Forja, alvo, pergaminho).
function chanceFinalRefinamentoPpm(alvo, nivelForja, bonusPergaminhoPercentual = 0) {
  if (REFINAMENTOS_GARANTIDOS.includes(alvo)) return BASE_SORTEIO;

  const base = CHANCE_BASE_REFINAMENTO_PPM_POR_ALVO[alvo] ?? 0;
  const bonusForja = BONUS_FORJA_REFINAMENTO_PPM_POR_NIVEL[nivelForja] ?? 0;
  const bonusPergaminho = Math.round((bonusPergaminhoPercentual / 100) * BASE_SORTEIO);
  const somaBruta = base + bonusForja + bonusPergaminho;
  return Math.min(somaBruta, forgeConfig.CAP_CHANCE_REFINAMENTO_PPM);
}

function rolarSucessoRefinamento(chancePpm) {
  return crypto.randomInt(0, BASE_SORTEIO) < chancePpm;
}

module.exports = {
  rolarBarraBonus,
  rolarDegrausQualidadeSuperior,
  qualidadeComDegraus,
  chanceFinalRefinamentoPpm,
  rolarSucessoRefinamento,
};
