// PvP v2 §16 — chaveamento de torneio (parte pura: sorteio, estrutura,
// formatos MD3/MD5 e avanço do bracket).
const test = require("node:test");
const assert = require("node:assert/strict");

const bracket = require("../src/services/tournamentBracketService");
const { vitoriasNecessarias } = require("../src/services/tournamentMatchService");

test("só 4 ou 8 participantes iniciam (simplificação aceita da spec)", () => {
  assert.equal(bracket.contagemValida(4), true);
  assert.equal(bracket.contagemValida(8), true);
  for (const invalido of [2, 3, 5, 6, 7, 9]) {
    assert.equal(bracket.contagemValida(invalido), false);
  }
  assert.throws(() => bracket.montarEstrutura([1, 2, 3, 4, 5]), /4 ou 8 participantes/);
});

test("estrutura de 8: Quartas MD3 → Semifinal MD3 → Final MD5 + 3º lugar MD3", () => {
  const { series, primeiraRodada } = bracket.montarEstrutura([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(primeiraRodada, "Quartas");

  const quartas = series.filter((s) => s.round === "Quartas");
  const semis = series.filter((s) => s.round === "Semifinal");
  const terceiro = series.filter((s) => s.round === "TerceiroLugar");
  const final = series.filter((s) => s.round === "Final");

  assert.equal(quartas.length, 4);
  assert.equal(semis.length, 2);
  assert.equal(terceiro.length, 1);
  assert.equal(final.length, 1);

  assert.ok(quartas.every((s) => s.format === "MD3"));
  assert.ok(semis.every((s) => s.format === "MD3"));
  assert.equal(terceiro[0].format, "MD3");
  assert.equal(final[0].format, "MD5");

  // Só as quartas já nascem com os dois lados preenchidos.
  assert.ok(quartas.every((s) => s.participant_a_id && s.participant_b_id));
  assert.ok(semis.every((s) => !s.participant_a_id && !s.participant_b_id));
});

test("estrutura de 4: Semifinal direto, sem Quartas", () => {
  const { series, primeiraRodada } = bracket.montarEstrutura([1, 2, 3, 4]);
  assert.equal(primeiraRodada, "Semifinal");
  assert.equal(series.filter((s) => s.round === "Quartas").length, 0);
  assert.equal(series.filter((s) => s.round === "Semifinal").length, 2);
  assert.equal(series.find((s) => s.round === "Final").format, "MD5");
  assert.equal(series.find((s) => s.round === "TerceiroLugar").format, "MD3");
});

test("MD3 precisa de 2 vitórias e MD5 de 3", () => {
  assert.equal(vitoriasNecessarias("MD3"), 2);
  assert.equal(vitoriasNecessarias("MD5"), 3);
});

test("sorteio é aleatório (não devolve sempre a mesma ordem)", () => {
  const ordens = new Set();
  for (let i = 0; i < 50; i += 1) {
    ordens.add(bracket.sortearChaveamento([1, 2, 3, 4, 5, 6, 7, 8]).bracketSeed.ordem.join(","));
  }
  // Com 8! = 40320 permutações, 50 sorteios iguais seria sinal de que o
  // embaralhamento não está acontecendo.
  assert.ok(ordens.size > 1, "o chaveamento não está sendo embaralhado");
});

test("sorteio preserva exatamente os participantes recebidos", () => {
  const entrada = [11, 22, 33, 44, 55, 66, 77, 88];
  const { bracketSeed } = bracket.sortearChaveamento(entrada);
  assert.deepEqual([...bracketSeed.ordem].sort((a, b) => a - b), entrada);
  assert.equal(bracketSeed.total, 8);
});

test("avanço do chaveamento: vencedor sobe, perdedor de semi vai ao 3º lugar", () => {
  assert.deepEqual(bracket.destinoDoVencedor("Quartas", 0), {
    round: "Semifinal",
    posicao: 0,
    lado: "a",
  });
  assert.deepEqual(bracket.destinoDoVencedor("Quartas", 1), {
    round: "Semifinal",
    posicao: 0,
    lado: "b",
  });
  assert.deepEqual(bracket.destinoDoVencedor("Quartas", 3), {
    round: "Semifinal",
    posicao: 1,
    lado: "b",
  });
  assert.deepEqual(bracket.destinoDoVencedor("Semifinal", 1), {
    round: "Final",
    posicao: 0,
    lado: "b",
  });
  assert.equal(bracket.destinoDoVencedor("Final", 0), null);

  assert.deepEqual(bracket.destinoDoPerdedor("Semifinal", 0), {
    round: "TerceiroLugar",
    posicao: 0,
    lado: "a",
  });
  assert.equal(bracket.destinoDoPerdedor("Quartas", 0), null);
});
