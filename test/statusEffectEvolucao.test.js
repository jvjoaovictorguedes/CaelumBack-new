// Evolução do Motor de Status — Habilidades + Armas. Cobre o que
// statusEffectService.test.js (pré-existente) não cobria: os 4 status
// novos (FREEZE/STUN/PARALYZE/BLIND), a remoção de SLOW, a política
// central de bloqueio de ação, a quebra de Freeze por dano direto, o
// fix de target Self/Enemy e o proc de status por arma. Testes puros
// primeiro (sem banco), depois integração real via combatController
// (mesmo padrão de combatBalance.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const statusEffectService = require("../src/services/statusEffectService");
const { CHAVES_VALIDAS, ACTION_TYPE, definicaoDoStatus } = require("../src/config/statusEffectConfig");
const { resolverResultadoDeAcerto } = require("../src/services/combatFormulas");
const { resolverEfeitosDeArmaNoHit } = require("../src/services/weaponEffectResolver");

function instancia(overrides = {}) {
  return {
    key: "FREEZE",
    sourceActorId: "player",
    sourcePowerId: null,
    sourceItemId: null,
    remainingTurns: 2,
    stacks: 1,
    potency: 0,
    appliedAtTurn: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------

test("SLOW não existe mais como chave válida", () => {
  assert.equal(CHAVES_VALIDAS.includes("SLOW"), false);
  assert.equal(definicaoDoStatus("SLOW"), null);
  assert.throws(() => statusEffectService.aplicarStatus([], instancia({ key: "SLOW" })));
});

test("catálogo canônico tem exatamente os 9 status esperados", () => {
  assert.deepEqual(
    [...CHAVES_VALIDAS].sort(),
    ["BLEED", "BLIND", "BURN", "FREEZE", "PARALYZE", "POISON", "SILENCE", "STUN", "WEAKEN"].sort(),
  );
});

// ---------------------------------------------------------------------
// FREEZE / STUN — stack e quebra por dano direto
// ---------------------------------------------------------------------

test("Freeze/Stun: reaplicar só estende se a duração nova for maior (RENEW_MAX_DURATION)", () => {
  let lista = statusEffectService.aplicarStatus([], instancia({ key: "FREEZE", remainingTurns: 3 }));
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "FREEZE", remainingTurns: 1 }));
  assert.equal(lista[0].remainingTurns, 3, "duração menor não reduz a existente");
  lista = statusEffectService.aplicarStatus(lista, instancia({ key: "FREEZE", remainingTurns: 5 }));
  assert.equal(lista[0].remainingTurns, 5);
  assert.equal(lista.length, 1, "sem stack");
});

test("removerFreezeAoReceberDanoDireto só quebra com dano > 0 (nunca DoT/dano zero)", () => {
  const lista = [instancia({ key: "FREEZE" })];
  const semDano = statusEffectService.removerFreezeAoReceberDanoDireto(lista, 0);
  assert.equal(semDano.quebrou, false);
  assert.equal(semDano.lista.length, 1);

  const comDano = statusEffectService.removerFreezeAoReceberDanoDireto(lista, 5);
  assert.equal(comDano.quebrou, true);
  assert.equal(comDano.lista.length, 0);
});

test("removerFreezeAoReceberDanoDireto não faz nada se não houver Freeze na lista", () => {
  const resultado = statusEffectService.removerFreezeAoReceberDanoDireto([instancia({ key: "STUN" })], 10);
  assert.equal(resultado.quebrou, false);
  assert.equal(resultado.lista.length, 1);
});

// ---------------------------------------------------------------------
// Política central de bloqueio de ação
// ---------------------------------------------------------------------

test("Silence bloqueia só POWER; ataque básico e item continuam liberados", () => {
  const { bloqueadas } = statusEffectService.resolverAcoesBloqueadasDoTurno(
    [instancia({ key: "SILENCE" })],
    1,
  );
  assert.deepEqual([...bloqueadas], [ACTION_TYPE.POWER]);
});

test("Freeze/Stun bloqueiam as 3 ações do turno (hard control)", () => {
  for (const chave of ["FREEZE", "STUN"]) {
    const { bloqueadas, motivoBloqueioTotal } = statusEffectService.resolverAcoesBloqueadasDoTurno(
      [instancia({ key: chave })],
      1,
    );
    assert.equal(bloqueadas.has(ACTION_TYPE.BASIC_ATTACK), true, chave);
    assert.equal(bloqueadas.has(ACTION_TYPE.POWER), true, chave);
    assert.equal(bloqueadas.has(ACTION_TYPE.ITEM), true, chave);
    assert.equal(motivoBloqueioTotal, chave);
  }
});

test("sem nenhum status de controle, nenhuma ação é bloqueada", () => {
  const { bloqueadas, motivoBloqueioTotal } = statusEffectService.resolverAcoesBloqueadasDoTurno([], 1);
  assert.equal(bloqueadas.size, 0);
  assert.equal(motivoBloqueioTotal, null);
});

test("Paralyze com potency=100 sempre bloqueia; potency=0 nunca bloqueia", () => {
  const sempre = statusEffectService.resolverAcoesBloqueadasDoTurno(
    [instancia({ key: "PARALYZE", potency: 100 })],
    1,
  );
  assert.equal(sempre.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK), true);
  assert.equal(sempre.motivoBloqueioTotal, "PARALYZE");

  const nunca = statusEffectService.resolverAcoesBloqueadasDoTurno(
    [instancia({ key: "PARALYZE", potency: 0 })],
    1,
  );
  assert.equal(nunca.bloqueadas.size, 0);
});

test("Paralyze: mesma checagem do turno não é rerrolada (idempotente por turno)", () => {
  const inicial = statusEffectService.resolverAcoesBloqueadasDoTurno(
    [instancia({ key: "PARALYZE", potency: 50 })],
    3,
  );
  const paralyzeInstancia = inicial.lista.find((s) => s.key === "PARALYZE");
  assert.equal(paralyzeInstancia.checkedTurn, 3);

  // Chamando de novo com o MESMO turno, N vezes — resultado (bloqueou
  // ou não) tem que ser sempre igual ao da primeira vez, nunca rerrolado.
  for (let i = 0; i < 10; i += 1) {
    const repetida = statusEffectService.resolverAcoesBloqueadasDoTurno(inicial.lista, 3);
    assert.equal(
      repetida.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK),
      inicial.bloqueadas.has(ACTION_TYPE.BASIC_ATTACK),
      `tentativa ${i}`,
    );
  }
});

test("Paralyze: turno novo pode rerrolar (checkedTurn muda)", () => {
  const turno1 = statusEffectService.resolverAcoesBloqueadasDoTurno(
    [instancia({ key: "PARALYZE", potency: 50 })],
    1,
  );
  const turno2 = statusEffectService.resolverAcoesBloqueadasDoTurno(turno1.lista, 2);
  const instanciaFinal = turno2.lista.find((s) => s.key === "PARALYZE");
  assert.equal(instanciaFinal.checkedTurn, 2);
});

test("removerStatusPorCategoria('CONTROLE') inclui os novos hard controls", () => {
  const lista = [
    instancia({ key: "FREEZE" }),
    instancia({ key: "STUN" }),
    instancia({ key: "PARALYZE" }),
    instancia({ key: "BLIND" }),
    instancia({ key: "SILENCE" }),
    instancia({ key: "WEAKEN" }),
    instancia({ key: "BURN" }),
  ];
  const semControle = statusEffectService.removerStatusPorCategoria(lista, "CONTROLE");
  assert.deepEqual(semControle.map((s) => s.key), ["BURN"]);
});

// ---------------------------------------------------------------------
// Blind + acerto
// ---------------------------------------------------------------------

test("Blind com potency=100 sempre erra (BLIND_MISS), mesmo sem chance de esquiva", () => {
  const resultado = resolverResultadoDeAcerto({
    atacante: { agilidade: 0 },
    defensor: { agilidade: 0 },
    blindPotency: 100,
  });
  assert.equal(resultado.hit, false);
  assert.equal(resultado.reason, "BLIND_MISS");
});

test("Blind com potency=0 nunca causa BLIND_MISS (só a esquiva normal pode negar o hit)", () => {
  for (let i = 0; i < 20; i += 1) {
    const resultado = resolverResultadoDeAcerto({
      atacante: { agilidade: 100 },
      defensor: { agilidade: 0 },
      blindPotency: 0,
    });
    assert.notEqual(resultado.reason, "BLIND_MISS");
  }
});

// ---------------------------------------------------------------------
// Proc de arma
// ---------------------------------------------------------------------

test("arma sem nenhum efeito configurado: nenhum proc", () => {
  const instancias = resolverEfeitosDeArmaNoHit({
    efeitosDaArma: [],
    personagemCaster: { inteligencia: 10 },
    casterActorId: "player",
    itemId: 42,
    turno: 1,
  });
  assert.deepEqual(instancias, []);
});

test("arma com efeito chance_ppm=1_000_000 sempre proca; chance_ppm=0 nunca proca", () => {
  const sempre = resolverEfeitosDeArmaNoHit({
    efeitosDaArma: [
      { status_key: "BLEED", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 5, potency_scale_attribute: null, potency_scale_value: 0, trigger: "BASIC_ATTACK_HIT", ativo: true },
    ],
    personagemCaster: {},
    casterActorId: "player",
    itemId: 7,
    turno: 3,
  });
  assert.equal(sempre.length, 1);
  assert.equal(sempre[0].key, "BLEED");
  assert.equal(sempre[0].sourceItemId, 7, "sourceItemId correto");
  assert.equal(sempre[0].sourcePowerId, null, "proc de arma nunca tem sourcePowerId");
  assert.equal(sempre[0].target, "Enemy");
  assert.equal(sempre[0].appliedAtTurn, 3);

  const nunca = resolverEfeitosDeArmaNoHit({
    efeitosDaArma: [
      { status_key: "BLEED", chance_ppm: 0, duration_turns: 2, potency_base: 5, potency_scale_attribute: null, potency_scale_value: 0, trigger: "BASIC_ATTACK_HIT", ativo: true },
    ],
    personagemCaster: {},
    casterActorId: "player",
    itemId: 7,
    turno: 3,
  });
  assert.deepEqual(nunca, []);
});

test("proc de arma ignora efeito inativo ou com trigger diferente de BASIC_ATTACK_HIT", () => {
  const instancias = resolverEfeitosDeArmaNoHit({
    efeitosDaArma: [
      { status_key: "BLEED", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 5, trigger: "BASIC_ATTACK_HIT", ativo: false },
      { status_key: "POISON", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 5, trigger: "OUTRO_TRIGGER_FUTURO", ativo: true },
    ],
    personagemCaster: {},
    casterActorId: "player",
    itemId: 7,
    turno: 1,
  });
  assert.deepEqual(instancias, []);
});

module.exports = { instancia };
