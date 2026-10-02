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

test("aplicarStatus: instância nova sem percentual (legado puro) continua funcionando como antes", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "POISON", potency: 4, percentualVidaMaxima: null }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "POISON", potency: 4, percentualVidaMaxima: null }));
  assert.equal(lista[0].stacks, 2);
  assert.equal(statusEffectService.calcularDanoDoTick(lista[0], 1000), 8);
});
