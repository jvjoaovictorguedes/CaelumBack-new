// PvP v2 §4/§5/§6 — derivação pura de Tier/Divisão, adjacência de
// pareamento e tabela de deltas. Nenhum banco envolvido.
const test = require("node:test");
const assert = require("node:assert/strict");

const rankedTierService = require("../src/services/rankedTierService");
const { RATING_INICIAL } = require("../src/config/rankedConfig");

test("jogador novo começa em 1000 = Bronze IV", () => {
  assert.equal(RATING_INICIAL, 1000);
  const t = rankedTierService.tierDivisaoParaRating(RATING_INICIAL);
  assert.equal(t.tier, "Bronze");
  assert.equal(t.divisao, "IV");
  assert.equal(t.label, "Bronze IV");
});

// Cada fronteira da tabela da spec, inclusive as bordas exatas
// 999/1000 e 2999/3000.
const FRONTEIRAS = [
  [0, "Ferro IV"],
  [699, "Ferro IV"],
  [700, "Ferro III"],
  [799, "Ferro III"],
  [800, "Ferro II"],
  [899, "Ferro II"],
  [900, "Ferro I"],
  [999, "Ferro I"],
  [1000, "Bronze IV"],
  [1099, "Bronze IV"],
  [1100, "Bronze III"],
  [1199, "Bronze III"],
  [1200, "Bronze II"],
  [1299, "Bronze II"],
  [1300, "Bronze I"],
  [1399, "Bronze I"],
  [1400, "Prata IV"],
  [1499, "Prata IV"],
  [1500, "Prata III"],
  [1599, "Prata III"],
  [1600, "Prata II"],
  [1699, "Prata II"],
  [1700, "Prata I"],
  [1799, "Prata I"],
  [1800, "Ouro IV"],
  [1899, "Ouro IV"],
  [1900, "Ouro III"],
  [1999, "Ouro III"],
  [2000, "Ouro II"],
  [2099, "Ouro II"],
  [2100, "Ouro I"],
  [2199, "Ouro I"],
  [2200, "Platina IV"],
  [2299, "Platina IV"],
  [2300, "Platina III"],
  [2399, "Platina III"],
  [2400, "Platina II"],
  [2499, "Platina II"],
  [2500, "Platina I"],
  [2599, "Platina I"],
  [2600, "Diamante IV"],
  [2699, "Diamante IV"],
  [2700, "Diamante III"],
  [2799, "Diamante III"],
  [2800, "Diamante II"],
  [2899, "Diamante II"],
  [2900, "Diamante I"],
  [2999, "Diamante I"],
  [3000, "Mestre"],
  [99999, "Mestre"],
];

test("Tier/Divisão correto em todas as fronteiras da spec", () => {
  for (const [rating, esperado] of FRONTEIRAS) {
    assert.equal(
      rankedTierService.tierDivisaoParaRating(rating).label,
      esperado,
      `rating ${rating} deveria ser ${esperado}`,
    );
  }
});

test("Mestre não tem divisão", () => {
  assert.equal(rankedTierService.tierDivisaoParaRating(3500).divisao, null);
});

test("chave de asset é estável e derivada do Tier", () => {
  assert.equal(rankedTierService.tierParaAsset("Ferro"), "ferro");
  assert.equal(rankedTierService.tierParaAsset("Mestre"), "mestre");
  assert.equal(rankedTierService.tierDivisaoParaRating(2650).asset, "diamante");
  // Nome desconhecido nunca vira caminho arbitrário: cai no tier base.
  assert.equal(rankedTierService.tierParaAsset("../../hack.png"), "ferro");
});

test("adjacência de pareamento é ±1 tier e nunca expande", () => {
  assert.deepEqual(rankedTierService.tiersAdjacentes("Ferro"), ["Ferro", "Bronze"]);
  assert.deepEqual(rankedTierService.tiersAdjacentes("Bronze"), ["Ferro", "Bronze", "Prata"]);
  assert.deepEqual(rankedTierService.tiersAdjacentes("Mestre"), ["Diamante", "Mestre"]);

  // Ferro nunca encara Prata.
  assert.equal(rankedTierService.saoTiersAdjacentes("Ferro", "Prata"), false);
  // Bronze encara Ferro/Bronze/Prata.
  for (const alvo of ["Ferro", "Bronze", "Prata"]) {
    assert.equal(rankedTierService.saoTiersAdjacentes("Bronze", alvo), true);
  }
  assert.equal(rankedTierService.saoTiersAdjacentes("Bronze", "Ouro"), false);
  // Mestre só encara Diamante/Mestre.
  assert.equal(rankedTierService.saoTiersAdjacentes("Mestre", "Platina"), false);
  assert.equal(rankedTierService.saoTiersAdjacentes("Mestre", "Diamante"), true);
});

test("deltas de rating seguem a tabela por diferença de tier", () => {
  // Mesmo tier: +18 / -18.
  assert.equal(
    rankedTierService.deltaRating({ ratingJogador: 1000, ratingOponente: 1200, venceu: true }),
    18,
  );
  assert.equal(
    rankedTierService.deltaRating({ ratingJogador: 1000, ratingOponente: 1200, venceu: false }),
    -18,
  );
  // Oponente um tier acima (Bronze x Prata): +22 / -14.
  assert.equal(
    rankedTierService.deltaRating({ ratingJogador: 1000, ratingOponente: 1450, venceu: true }),
    22,
  );
  assert.equal(
    rankedTierService.deltaRating({ ratingJogador: 1000, ratingOponente: 1450, venceu: false }),
    -14,
  );
  // Oponente um tier abaixo (Bronze x Ferro): +14 / -22.
  assert.equal(
    rankedTierService.deltaRating({ ratingJogador: 1000, ratingOponente: 900, venceu: true }),
    14,
  );
  assert.equal(
    rankedTierService.deltaRating({ ratingJogador: 1000, ratingOponente: 900, venceu: false }),
    -22,
  );
});

test("rating nunca fica negativo ao aplicar derrota no piso", () => {
  assert.equal(rankedTierService.aplicarDelta(10, -22), 0);
});
