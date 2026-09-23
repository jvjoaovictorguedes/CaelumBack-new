// PvP v2 §16 — chaveamento de torneio (parte pura: sorteio, estrutura,
// formatos MD3/MD5 e avanço do bracket).
const test = require("node:test");
const assert = require("node:assert/strict");

const bracket = require("../src/services/tournamentBracketService");
const { vitoriasNecessarias } = require("../src/services/tournamentMatchService");

test("4, 8 e 16 são os tamanhos de chave válidos", () => {
  assert.equal(bracket.contagemValida(4), true);
  assert.equal(bracket.contagemValida(8), true);
  assert.equal(bracket.contagemValida(16), true);
  for (const invalido of [2, 3, 5, 6, 7, 9, 15, 17]) {
    assert.equal(bracket.contagemValida(invalido), false);
  }
});

test("calcularTamanhoDeChave escolhe o menor formato que comporta os inscritos (sobra vira bye)", () => {
  assert.equal(bracket.calcularTamanhoDeChave(2), 4);
  assert.equal(bracket.calcularTamanhoDeChave(3), 4);
  assert.equal(bracket.calcularTamanhoDeChave(4), 4);
  assert.equal(bracket.calcularTamanhoDeChave(5), 8);
  assert.equal(bracket.calcularTamanhoDeChave(8), 8);
  assert.equal(bracket.calcularTamanhoDeChave(9), 16);
  assert.equal(bracket.calcularTamanhoDeChave(16), 16);
  assert.throws(() => bracket.calcularTamanhoDeChave(1), /pelo menos 2 participantes/);
  assert.throws(() => bracket.calcularTamanhoDeChave(17), /participantes demais/);
});

test("estrutura de 8: Quartas MD3 → Semifinal MD3 → Final MD5 + 3º lugar MD3", () => {
  const { series, primeiraRodada } = bracket.montarEstrutura([1, 2, 3, 4, 5, 6, 7, 8], 8);
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

  // Sem bye (8 inscritos pra chave de 8): só as quartas já nascem com os
  // dois lados preenchidos.
  assert.ok(quartas.every((s) => s.participant_a_id && s.participant_b_id));
  assert.ok(semis.every((s) => !s.participant_a_id && !s.participant_b_id));
});

test("estrutura de 4: Semifinal direto, sem Quartas", () => {
  const { series, primeiraRodada } = bracket.montarEstrutura([1, 2, 3, 4], 4);
  assert.equal(primeiraRodada, "Semifinal");
  assert.equal(series.filter((s) => s.round === "Quartas").length, 0);
  assert.equal(series.filter((s) => s.round === "Semifinal").length, 2);
  assert.equal(series.find((s) => s.round === "Final").format, "MD5");
  assert.equal(series.find((s) => s.round === "TerceiroLugar").format, "MD3");
});

test("estrutura de 16: Oitavas → Quartas vazias → Semifinal vazia → 3º lugar + Final", () => {
  const participantes = Array.from({ length: 16 }, (_, i) => i + 1);
  const { series, primeiraRodada } = bracket.montarEstrutura(participantes, 16);
  assert.equal(primeiraRodada, "Oitavas");

  const oitavas = series.filter((s) => s.round === "Oitavas");
  const quartas = series.filter((s) => s.round === "Quartas");
  const semis = series.filter((s) => s.round === "Semifinal");

  assert.equal(oitavas.length, 8);
  assert.equal(quartas.length, 4);
  assert.equal(semis.length, 2);
  assert.equal(series.filter((s) => s.round === "TerceiroLugar").length, 1);
  assert.equal(series.filter((s) => s.round === "Final").length, 1);

  assert.ok(oitavas.every((s) => s.participant_a_id && s.participant_b_id));
  assert.ok(quartas.every((s) => !s.participant_a_id && !s.participant_b_id));
  assert.ok(semis.every((s) => !s.participant_a_id && !s.participant_b_id));
});

test("bye: sobra na primeira rodada nasce sem adversário (participant_b_id nulo)", () => {
  const { series } = bracket.montarEstrutura([1, 2, 3, 4, 5], 8);
  const quartas = series.filter((s) => s.round === "Quartas");
  assert.equal(quartas.length, 4);

  const comBye = quartas.filter((s) => Boolean(s.participant_a_id) !== Boolean(s.participant_b_id));
  const semBye = quartas.filter((s) => s.participant_a_id && s.participant_b_id);
  assert.equal(comBye.length, 3, "3 sobras (8 vagas - 5 inscritos) viram bye");
  assert.equal(semBye.length, 1, "1 confronto real entre os 2 que restaram");
});

test("bye na Semifinal (chave de 4) não cria série de 3º lugar — não há perdedor de semifinal", () => {
  const { series } = bracket.montarEstrutura([1, 2], 4);
  assert.equal(series.filter((s) => s.round === "TerceiroLugar").length, 0);
  assert.equal(series.filter((s) => s.round === "Semifinal").length, 2);
  assert.ok(
    series
      .filter((s) => s.round === "Semifinal")
      .every((s) => Boolean(s.participant_a_id) !== Boolean(s.participant_b_id)),
  );
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

  // Oitavas (formato 16x16) alimenta Quartas do mesmo jeito que Quartas
  // alimenta Semifinal — e perdedor de Oitavas é só eliminado, não vai
  // pra lugar nenhum (só perdedor de SEMIFINAL disputa 3º lugar).
  assert.deepEqual(bracket.destinoDoVencedor("Oitavas", 0), {
    round: "Quartas",
    posicao: 0,
    lado: "a",
  });
  assert.deepEqual(bracket.destinoDoVencedor("Oitavas", 5), {
    round: "Quartas",
    posicao: 2,
    lado: "b",
  });
  assert.equal(bracket.destinoDoPerdedor("Oitavas", 0), null);
});
