// Habilidades V2.0 §4/§21 — migração de magnitude de Burn/Bleed/Poison
// pra % de Vida Máxima, em modo dual (coexiste com o potency absoluto
// legado). Cobre: calcularDanoDoTick nos dois modos, processarTicksDeInicio
// usando vidaMaxima só quando a instância pede, e aplicarStatus nunca
// misturando potency/percentualVidaMaxima de duas instâncias diferentes
// ao decidir qual "vence" num reapply.
const test = require("node:test");
const assert = require("node:assert/strict");

const statusEffectService = require("../src/services/statusEffectService");

function instancia(overrides = {}) {
  return {
    key: "BURN",
    sourceActorId: "player",
    sourcePowerId: null,
    sourceItemId: null,
    remainingTurns: 2,
    stacks: 1,
    potency: 10,
    percentualVidaMaxima: null,
    appliedAtTurn: 1,
    ...overrides,
  };
}

test("calcularDanoDoTick: percentualVidaMaxima null preserva o legado (potency * stacks)", () => {
  const dano = statusEffectService.calcularDanoDoTick(instancia({ potency: 7, stacks: 3 }), 1000);
  assert.equal(dano, 21);
});

test("calcularDanoDoTick: percentualVidaMaxima configurado ignora potency e usa % da Vida Máxima", () => {
  const dano = statusEffectService.calcularDanoDoTick(
    instancia({ potency: 999, percentualVidaMaxima: 5, stacks: 1 }),
    1000,
  );
  assert.equal(dano, 50, "5% de 1000 = 50, nunca o potency legado de 999");
});

test("calcularDanoDoTick: percentualVidaMaxima multiplica por stacks igual ao modo legado", () => {
  const dano = statusEffectService.calcularDanoDoTick(
    instancia({ key: "POISON", percentualVidaMaxima: 2, stacks: 3 }),
    1000,
  );
  assert.equal(dano, 60, "2% de 1000 * 3 stacks = 60");
});

test("processarTicksDeInicio: status legado (percentualVidaMaxima null) ignora vidaMaxima", () => {
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 100,
    vidaMaxima: 99999,
    defensor: { defesa: 0 },
    lista: [instancia({ potency: 15, percentualVidaMaxima: null })],
    log: [],
    nomeAlvo: "Alvo",
  });
  assert.equal(vidaFinal, 85, "dano absoluto de 15, independente da vidaMaxima passada");
});

test("processarTicksDeInicio: status percentual usa vidaMaxima explícita", () => {
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 200,
    vidaMaxima: 200,
    defensor: { defesa: 0 },
    lista: [instancia({ percentualVidaMaxima: 10 })],
    log: [],
    nomeAlvo: "Alvo",
  });
  assert.equal(vidaFinal, 180, "10% de 200 = 20 de dano");
});

test("processarTicksDeInicio: sem vidaMaxima explícita, cai pro fallback defensor.vida_maxima", () => {
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 200,
    defensor: { defesa: 0, vida_maxima: 400 },
    lista: [instancia({ percentualVidaMaxima: 10 })],
    log: [],
    nomeAlvo: "Alvo",
  });
  assert.equal(vidaFinal, 160, "10% de 400 (fallback) = 40 de dano");
});

test("aplicarStatus (BURN/RENEW_MAX_POTENCY): reaplicar com percentual mais forte adota o par completo da instância vencedora", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ potency: 50, percentualVidaMaxima: null }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ potency: 1, percentualVidaMaxima: 5 }));
  // percentual (5) é comparado contra potency legado (50) — a semântica
  // de "mais forte" aqui é best-effort entre unidades diferentes; o que
  // importa é NUNCA misturar o potency de uma com o percentual da outra.
  assert.equal(lista.length, 1);
  const vencedor = lista[0];
  if (vencedor.percentualVidaMaxima != null) {
    assert.equal(vencedor.potency, 1);
    assert.equal(vencedor.percentualVidaMaxima, 5);
  } else {
    assert.equal(vencedor.potency, 50);
    assert.equal(vencedor.percentualVidaMaxima, null);
  }
});

test("aplicarStatus (BURN): duas instâncias percentuais — vence o maior percentual, nunca mistura potency de outra fonte", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ potency: 999, percentualVidaMaxima: 3 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ potency: 1, percentualVidaMaxima: 8 }));
  assert.equal(lista[0].percentualVidaMaxima, 8);
  assert.equal(lista[0].potency, 1, "potency tem que vir DA MESMA instância que trouxe o percentual vencedor (1), nunca do 999 da outra");
});

test("aplicarStatus (BLEED/STACK_CAP): empilhar mantém o par potency/percentualVidaMaxima coerente", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "BLEED", potency: 999, percentualVidaMaxima: 2 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "BLEED", potency: 1, percentualVidaMaxima: 6 }));
  assert.equal(lista[0].stacks, 2);
  assert.equal(lista[0].percentualVidaMaxima, 6);
  assert.equal(lista[0].potency, 1);
});

// ---------------------------------------------------------------------
// DOT_TOTAL_MAX_PCT_PER_TURN — teto agregado por contexto (Habilidades
// V2.0 §11/§17)
// ---------------------------------------------------------------------

test("processarTicksDeInicio: sem contexto, nenhum teto é aplicado (comportamento de sempre)", () => {
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 1000,
    vidaMaxima: 1000,
    defensor: { defesa: 0 },
    lista: [
      instancia({ key: "BURN", percentualVidaMaxima: 30 }),
      instancia({ key: "BLEED", percentualVidaMaxima: 30, stacks: 1 }),
      instancia({ key: "POISON", percentualVidaMaxima: 30, stacks: 1 }),
    ],
    log: [],
    nomeAlvo: "Alvo",
  });
  assert.equal(vidaFinal, 100, "90% de dano bruto aplicado inteiro, sem contexto não há teto");
});

test("processarTicksDeInicio: com contexto, total ABAIXO do teto não sofre escalonamento algum", () => {
  const eventos = [];
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 1000,
    vidaMaxima: 1000,
    defensor: { defesa: 0 },
    lista: [instancia({ key: "BURN", percentualVidaMaxima: 10 }), instancia({ key: "BLEED", percentualVidaMaxima: 10, stacks: 1 })],
    log: [],
    nomeAlvo: "Alvo",
    contexto: "PVE", // teto 50% de 1000 = 500
    eventos,
  });
  // bruto = 100 + 100 = 200, bem abaixo do teto de 500 — sem escalonamento.
  assert.equal(vidaFinal, 800);
  assert.equal(eventos.length, 2);
  assert.deepEqual(eventos.map((e) => e.dano).sort(), [100, 100]);
});

test("processarTicksDeInicio: teto excedido escala TODOS os ticks proporcionalmente, nunca zera um e deixa outro intacto", () => {
  const eventos = [];
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 1000,
    vidaMaxima: 1000,
    defensor: { defesa: 0 },
    lista: [
      instancia({ key: "BURN", percentualVidaMaxima: 40 }),
      instancia({ key: "BLEED", percentualVidaMaxima: 40, stacks: 1 }),
      instancia({ key: "POISON", percentualVidaMaxima: 40, stacks: 1 }),
    ],
    log: [],
    nomeAlvo: "Alvo",
    contexto: "PVE", // teto 50% de 1000 = 500
    eventos,
  });
  // bruto = 400*3 = 1200; teto 500; fator ≈ 0.41667 — cada tick de 400 vira ~167.
  assert.equal(eventos.length, 3, "nenhum status foi zerado, todos ticaram (só reduzidos)");
  const totalAplicado = eventos.reduce((soma, e) => soma + e.dano, 0);
  // Arredondamento por tick pode passar o teto em no máximo alguns
  // pontos (3 ticks, no pior caso ~1 unidade de arredondamento cada) —
  // nunca uma folga grande, que indicaria o escalonamento não rodando.
  assert.ok(totalAplicado <= 510, `total aplicado (${totalAplicado}) não pode estourar o teto de 500 por mais que o arredondamento explica`);
  assert.ok(totalAplicado > 490, "escalonamento deve ficar bem próximo do teto, não zerar tudo");
  assert.equal(vidaFinal, 1000 - totalAplicado);
  const danos = eventos.map((e) => e.dano);
  assert.ok(danos.every((d) => d === danos[0]), "os 3 ticks eram idênticos antes do teto, então devem continuar idênticos depois de escalados igualmente");
});

test("aplicarStatus: instância nova sem percentual (legado puro) continua funcionando como antes", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "POISON", potency: 4, percentualVidaMaxima: null }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "POISON", potency: 4, percentualVidaMaxima: null }));
  assert.equal(lista[0].stacks, 2);
  assert.equal(statusEffectService.calcularDanoDoTick(lista[0], 1000), 8);
});
