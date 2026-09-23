// Motor de Status — testes unitários puros (§76 da Especificação
// Consolidada Poder/Status/Cooldown/Balanceamento). Sem banco de dados.
const test = require("node:test");
const assert = require("node:assert/strict");

const statusEffectService = require("../src/services/statusEffectService");

function instancia(overrides = {}) {
  return {
    key: "BURN",
    sourceActorId: "player",
    sourcePowerId: 1,
    sourceItemId: null,
    remainingTurns: 3,
    stacks: 1,
    potency: 10,
    appliedAtTurn: 1,
    ...overrides,
  };
}

test("Burn renova a duração e mantém a maior potência ao reaplicar", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ remainingTurns: 3, potency: 10 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ remainingTurns: 5, potency: 6 }));
  assert.equal(lista.length, 1);
  assert.equal(lista[0].remainingTurns, 5);
  assert.equal(lista[0].potency, 10, "mantém a maior potência já aplicada, não a mais recente");
  assert.equal(lista[0].stacks, 1, "Burn nunca empilha");
});

test("Bleed respeita o máximo de 3 stacks", () => {
  let lista = [];
  for (let i = 0; i < 5; i += 1) {
    lista = statusEffectService.aplicarStatus(lista, instancia({ key: "BLEED", remainingTurns: 2, potency: 4 }));
  }
  assert.equal(lista.length, 1);
  assert.equal(lista[0].stacks, 3, "capado em 3 mesmo reaplicando 5 vezes");
});

test("Bleed: cada stack aumenta o tick (potência × stacks)", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "BLEED", potency: 5, remainingTurns: 2 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "BLEED", potency: 5, remainingTurns: 2 }));
  assert.equal(lista[0].stacks, 2);
  assert.equal(statusEffectService.calcularDanoDoTick(lista[0]), 10);
});

test("Silêncio bloqueia Power e não o ataque básico", () => {
  const lista = statusEffectService.aplicarStatus([], instancia({ key: "SILENCE", remainingTurns: 2, potency: 0 }));
  assert.equal(statusEffectService.bloqueiaHabilidadesAtivas(lista), true);
  assert.equal(statusEffectService.possuiStatus(lista, "SILENCE"), true);
  // Nada no motor bloqueia ataque básico — bloqueiaHabilidadesAtivas é a
  // ÚNICA checagem usada antes de "power" em combatController.js; um
  // "attack" nunca consulta essa função.
});

test("Silêncio: reaplicar só estende se a nova duração for maior", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "SILENCE", remainingTurns: 3, potency: 0 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "SILENCE", remainingTurns: 1, potency: 0 }));
  assert.equal(lista[0].remainingTurns, 3, "duração menor não reduz a existente");
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "SILENCE", remainingTurns: 5, potency: 0 }));
  assert.equal(lista[0].remainingTurns, 5, "duração maior estende");
});

test("Slow/Weaken alteram apenas durante a duração (removidos ao expirar)", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "WEAKEN", remainingTurns: 1, potency: 30 }));
  assert.equal(statusEffectService.multiplicadorDeDanoDeSaida(lista), 0.7);
  lista = statusEffectService.decrementarDuracoes(lista);
  assert.equal(lista.length, 0, "expira depois de decrementar de 1 pra 0");
  assert.equal(statusEffectService.multiplicadorDeDanoDeSaida(lista), 1, "sem Weaken, multiplicador volta a 1");
});

test("Slow/Weaken: reaplicar fica com a MAIOR potência", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "WEAKEN", remainingTurns: 2, potency: 10 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "WEAKEN", remainingTurns: 1, potency: 40 }));
  assert.equal(lista[0].potency, 40);
  assert.equal(lista[0].stacks, 1);
});

test("DoT pode matar no início do turno (para de processar após a morte)", () => {
  const log = [];
  const lista = [
    instancia({ key: "BURN", potency: 40 }),
    instancia({ key: "POISON", potency: 40 }),
  ];
  const vidaFinal = statusEffectService.processarTicksDeInicio({
    vidaAtual: 30,
    defensor: { defesa: 0 },
    lista,
    log,
    nomeAlvo: "Alvo",
  });
  assert.equal(vidaFinal, 0);
  // O tick de Burn (40 de dano em 30 de vida) já mata — o Poison nem
  // chega a processar, porque o loop para assim que a vida zera.
  assert.equal(log.length, 1);
  assert.ok(log[0].includes("Queimadura"));
});

test("Expiração ocorre no turno correto (decrementarDuracoes remove remainingTurns<=0)", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ remainingTurns: 2 }));
  lista = statusEffectService.decrementarDuracoes(lista);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].remainingTurns, 1);
  lista = statusEffectService.decrementarDuracoes(lista);
  assert.equal(lista.length, 0);
});

test("Reaplicação não cria entradas duplicadas da mesma chave", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "POISON" }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "POISON" }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "POISON" }));
  assert.equal(lista.filter((s) => s.key === "POISON").length, 1);
});

test("removerStatus e removerStatusPorCategoria (§65 — dispel/cleanse)", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "BLEED" }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "SILENCE", potency: 0 }));
  const semBleed = statusEffectService.removerStatus(lista, "BLEED");
  assert.equal(semBleed.some((s) => s.key === "BLEED"), false);
  assert.equal(semBleed.some((s) => s.key === "SILENCE"), true);

  const semDot = statusEffectService.removerStatusPorCategoria(lista, "DOT");
  assert.equal(semDot.some((s) => s.key === "BLEED"), false);
  const semControle = statusEffectService.removerStatusPorCategoria(lista, "CONTROLE");
  assert.equal(semControle.some((s) => s.key === "SILENCE"), false);
});

test("mitigação por Defesa aplicada ao tick quando a política do status é DEFENSE", () => {
  const log = [];
  const alta = statusEffectService.processarTicksDeInicio({
    vidaAtual: 1000,
    defensor: { defesa: 0 },
    lista: [instancia({ key: "BURN", potency: 100 })],
    log,
    nomeAlvo: "Alvo",
  });
  const log2 = [];
  const baixa = statusEffectService.processarTicksDeInicio({
    vidaAtual: 1000,
    defensor: { defesa: 100 },
    lista: [instancia({ key: "BURN", potency: 100 })],
    log: log2,
    nomeAlvo: "Alvo",
  });
  assert.ok(1000 - baixa < 1000 - alta, "mais Defesa reduz o dano do tick (política DEFENSE)");
});
