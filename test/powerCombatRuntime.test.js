const test = require("node:test");
const assert = require("node:assert/strict");
const runtime = require("../src/services/powerCombatRuntime");
const {
  aplicarAcao,
  resolverTurnoComStatus,
} = require("../src/services/duelEngine");

function actor(id = 1, overrides = {}) {
  return {
    id,
    forca: 10,
    vitalidade: 10,
    inteligencia: 10,
    agilidade: 0,
    velocidade: 0,
    defesa: 0,
    vida_atual: 50,
    mana_atual: 20,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    ...overrides,
  };
}
function row(effect_key = "REGEN_MANA_FLAT", magnitude = 5, overrides = {}) {
  return {
    id: 1,
    effect_key,
    magnitude,
    target: "SELF",
    chance_ppm: 1000000,
    reapply_policy: "REFRESH",
    ...overrides,
  };
}
function setup(trigger, effect = row()) {
  const source = runtime.participant(actor(), {
    key: 1,
    team: "allies",
    hpMax: 100,
    mpMax: 100,
    triggers: new Map([[trigger, [effect]]]),
  });
  const target = runtime.participant(actor(2), {
    key: 2,
    team: "enemies",
    hpMax: 100,
    mpMax: 100,
  });
  return [source, target];
}
async function random(value, fn) {
  const before = Math.random;
  Math.random = typeof value === "function" ? value : () => value;
  try {
    return await fn();
  } finally {
    Math.random = before;
  }
}
function action(source, target, acao = { tipo: "attack" }, extra = {}) {
  return aplicarAcao({
    atacante: source.actor,
    defensor: target.actor,
    acao,
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    vidaMaxDefensor: 100,
    manaMaxDefensor: 100,
    gatilhosAtacante: source.triggers,
    gatilhosDefensor: target.triggers,
    ...extra,
  });
}

for (const trigger of ["COMBAT_START", "TURN_START", "TURN_END"]) {
  test(`${trigger}: evento real de passar o turno executa a linha`, () => {
    const [source, target] = setup(trigger);
    action(source, target, { tipo: "pass" });
    assert.equal(source.actor.mana_atual, 25);
    action(source, target, { tipo: "pass" });
    assert.equal(source.actor.mana_atual, trigger === "COMBAT_START" ? 25 : 30);
  });
}

test("ON_CAST executa em poder de cura e altera o dano da própria habilidade", async () => {
  const [source, target] = setup(
    "ON_CAST",
    row("DAMAGE_DEALT_PCT", 100, { duration_turns: 1 }),
  );
  const power = {
    nome: "Raio",
    dano_base: 20,
    cura_base: 0,
    custo_mana: 0,
    escala_atributo: "Inteligencia",
    valor_escala: 0,
  };
  const base = await random(0.99, () =>
    action(...setup("ON_CAST", row("DAMAGE_DEALT_PCT", 0)), {
      tipo: "power",
      power,
    }),
  );
  const buffed = await random(0.99, () =>
    action(source, target, { tipo: "power", power }),
  );
  assert.equal(buffed.dano, base.dano * 2);
  assert.equal(source.actor.powerCombatState.effects.length, 1);
});

test("ON_HIT e ON_CRIT: acertar sem crítico não executa ON_CRIT", async () => {
  const [source, target] = setup("ON_CRIT");
  source.triggers.set("ON_HIT", [row("REGEN_MANA_FLAT", 2)]);
  await random(0.99, () => action(source, target));
  assert.equal(source.actor.mana_atual, 22);
  target.actor.vida_atual = 100;
  let roll = 0;
  await random(
    () => (roll++ === 0 ? 0.99 : 0),
    () => action(source, target),
  );
  assert.equal(source.actor.mana_atual, 29);
});

test("ON_DAMAGE_TAKEN reage no defensor; escudo completo não dispara o evento", async () => {
  const [source, target] = setup("ON_HIT");
  target.triggers.set("ON_DAMAGE_TAKEN", [row()]);
  await random(0.99, () =>
    action(
      source,
      target,
      { tipo: "attack" },
      { escudoDefensor: { valor: 1000, remainingTurns: 3 } },
    ),
  );
  assert.equal(target.actor.mana_atual, 20);
  assert.equal(
    source.actor.mana_atual,
    25,
    "hit acontece mesmo sem reduzir HP",
  );
  target.actor.powerCombatState.shield = null;
  await random(0.99, () => action(source, target));
  assert.equal(target.actor.mana_atual, 25);
});

test("ON_DODGE executa somente em esquiva; cegueira do atacante não dispara", async () => {
  const [source, target] = setup("ON_HIT");
  target.triggers.set("ON_DODGE", [row()]);
  target.actor.agilidade = 100;
  await random(0, () => action(source, target));
  assert.equal(target.actor.mana_atual, 25);
  target.actor.agilidade = 0;
  await random(0, () =>
    action(source, target, { tipo: "attack" }, { blindPotency: 100 }),
  );
  assert.equal(target.actor.mana_atual, 25);
});

test("ON_HEAL exige recuperação efetiva; cura no máximo não dispara", async () => {
  const [source, target] = setup("ON_HEAL");
  const power = {
    nome: "Cura",
    dano_base: 0,
    cura_base: 10,
    custo_mana: 0,
    escala_atributo: "Inteligencia",
    valor_escala: 0,
  };
  action(source, target, { tipo: "power", power });
  assert.equal(source.actor.mana_atual, 25);
  source.actor.vida_atual = 100;
  action(source, target, { tipo: "power", power });
  assert.equal(source.actor.mana_atual, 25);
});

test("ON_KILL dispara uma vez; morto não é ressuscitado por reação", async () => {
  const [source, target] = setup("ON_KILL");
  target.actor.vida_atual = 1;
  target.triggers.set("ON_DAMAGE_TAKEN", [row("REGEN_HP_FLAT", 100)]);
  await random(0.99, () => action(source, target));
  assert.equal(source.actor.mana_atual, 25);
  assert.equal(target.actor.vida_atual, 0);
  await random(0.99, () => action(source, target));
  assert.equal(source.actor.mana_atual, 25);
});

test("condições e chance são avaliadas no evento, com o HP máximo real", () => {
  const [source, target] = setup(
    "TURN_START",
    row("REGEN_MANA_FLAT", 5, {
      condition_key: "SELF_HP_BELOW_PCT",
      condition_config: { limite_pct: 30 },
      chance_ppm: 500000,
    }),
  );
  runtime.emit("TURN_START", source, target, undefined, () => 0);
  assert.equal(source.actor.mana_atual, 20);
  source.actor.vida_atual = 20;
  runtime.emit("TURN_START", source, target, undefined, () => 0.9);
  assert.equal(source.actor.mana_atual, 20);
  runtime.emit("TURN_START", source, target, undefined, () => 0.1);
  assert.equal(source.actor.mana_atual, 25);
});

test("alvos de grupo e condições por alvo respeitam equipe e não curam mortos", () => {
  const [source, target] = setup(
    "ON_CAST",
    row("REGEN_HP_FLAT", 10, {
      target: "ALL_ALLIES",
      condition_key: "TARGET_HP_BELOW_PCT",
      condition_config: { limite_pct: 80 },
    }),
  );
  const ally = runtime.participant(actor(3), { team: "allies", hpMax: 100 });
  const dead = runtime.participant(actor(4, { vida_atual: 0 }), {
    team: "allies",
    hpMax: 100,
  });
  runtime.emit("ON_CAST", source, target, [source, target, ally, dead]);
  assert.equal(source.actor.vida_atual, 60);
  assert.equal(ally.actor.vida_atual, 60);
  assert.equal(target.actor.vida_atual, 50);
  assert.equal(dead.actor.vida_atual, 0);
});

for (const policy of [
  "BLOCK_WHILE_ACTIVE",
  "REFRESH",
  "STRONGEST",
  "STACK",
  "REPLACE",
  "UNIQUE_SOURCE",
]) {
  test(`reaplicação ${policy} e expiração persistem ao serializar`, () => {
    const [source, target] = setup(
      "ON_CAST",
      row("DEFENSE_FLAT", 10, {
        stack_group: "protection",
        reapply_policy: policy,
        max_stacks: 2,
        duration_turns: 1,
      }),
    );
    runtime.begin(source, target);
    runtime.emit("ON_CAST", source, target);
    source.triggers.set("ON_CAST", [
      row("DEFENSE_FLAT", 20, {
        stack_group: "protection",
        reapply_policy: policy,
        max_stacks: 2,
        duration_turns: 1,
      }),
    ]);
    runtime.emit("ON_CAST", source, target);
    const expected = {
      BLOCK_WHILE_ACTIVE: 10,
      REFRESH: 10,
      STRONGEST: 20,
      STACK: 30,
      REPLACE: 20,
      UNIQUE_SOURCE: 20,
    };
    assert.equal(
      runtime.effective(source).get("DEFENSE_FLAT"),
      expected[policy],
    );
    runtime.end(source, target);
    source.actor.powerCombatState = JSON.parse(
      JSON.stringify(source.actor.powerCombatState),
    );
    runtime.begin(source, target);
    assert.equal(runtime.effective(source).get("DEFENSE_FLAT") ?? 0, 0);
  });
}

test("cleanse, cooldown e shield executam pelo catálogo tipado", () => {
  const [source, target] = setup(
    "ON_CAST",
    row("CLEANSE_STATUS", 0, { config: { status_key: "SILENCE" } }),
  );
  source.status = [{ key: "SILENCE", remainingTurns: 2 }];
  source.cooldowns = { "power:1": 3 };
  source.triggers
    .get("ON_CAST")
    .push(
      row("REDUCE_COOLDOWN", 2),
      row("GRANT_SHIELD", 10, { duration_turns: 2 }),
    );
  runtime.emit("ON_CAST", source, target);
  assert.deepEqual(source.status, []);
  assert.equal(source.cooldowns["power:1"], 1);
  assert.equal(source.shield.valor, 10);
});

test("turno bloqueado mantém início/fim e não dispara ON_CAST", async () => {
  const [source, target] = setup("TURN_START", row("REGEN_MANA_FLAT", 2));
  source.triggers.set("TURN_END", [row("REGEN_MANA_FLAT", 3)]);
  source.triggers.set("ON_CAST", [row("REGEN_MANA_FLAT", 10)]);
  const result = await resolverTurnoComStatus({
    atacante: source.actor,
    defensor: target.actor,
    acao: { tipo: "power", power: { id: 123 } },
    statusAtacante: [{ key: "SILENCE", remainingTurns: 3 }],
    statusDefensor: [],
    turno: 1,
    casterActorId: 1,
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    gatilhosAtacante: source.triggers,
  });
  assert.equal(result.bloqueado, true);
  assert.equal(source.actor.mana_atual, 25);
});

// Rebalanceamento de Powers de personagem (§6) — ON_POWER_CAST/
// ON_POWER_HIT só disparam pra efeitos da PRÓPRIA Power usada, nunca
// pra reagir ao uso de qualquer outra Power do loadout (diferença real
// de ON_CAST/ON_HIT, que disparam sempre). Filtra por sourcePowerId
// (Power.id), nunca por nome.

test("ON_POWER_CAST só dispara a linha cuja sourcePowerId bate com a Power usada", () => {
  const [source, target] = setup("ON_POWER_CAST");
  source.triggers.set("ON_POWER_CAST", [
    row("REGEN_MANA_FLAT", 5, { sourcePowerId: 10 }),
    row("REGEN_MANA_FLAT", 99, { sourcePowerId: 20 }),
  ]);
  source.actor.mana_atual = 0;
  runtime.emit("ON_POWER_CAST", source, target, undefined, Math.random, 10);
  assert.equal(source.actor.mana_atual, 5, "só a linha da Power 10 deveria ter disparado");
});

test("ON_POWER_CAST não dispara nenhuma linha quando nenhuma sourcePowerId bate", () => {
  const [source, target] = setup("ON_POWER_CAST", row("REGEN_MANA_FLAT", 5, { sourcePowerId: 10 }));
  source.actor.mana_atual = 0;
  runtime.emit("ON_POWER_CAST", source, target, undefined, Math.random, 999);
  assert.equal(source.actor.mana_atual, 0);
});

test("ON_POWER_HIT filtra por sourcePowerId do mesmo jeito que ON_POWER_CAST", () => {
  const [source, target] = setup("ON_POWER_HIT", row("REGEN_MANA_FLAT", 7, { sourcePowerId: 10 }));
  source.actor.mana_atual = 0;
  runtime.emit("ON_POWER_HIT", source, target, undefined, Math.random, 10);
  assert.equal(source.actor.mana_atual, 7);
  source.actor.mana_atual = 0;
  runtime.emit("ON_POWER_HIT", source, target, undefined, Math.random, 20);
  assert.equal(source.actor.mana_atual, 0);
});

test("sem sourcePowerId (default null), emit dispara TODAS as linhas do trigger (compat com ON_CAST/ON_HIT)", () => {
  const [source, target] = setup("ON_POWER_CAST");
  source.triggers.set("ON_POWER_CAST", [
    row("REGEN_MANA_FLAT", 3, { sourcePowerId: 10 }),
    row("REGEN_MANA_FLAT", 4, { sourcePowerId: 20 }),
  ]);
  source.actor.mana_atual = 0;
  runtime.emit("ON_POWER_CAST", source, target);
  assert.equal(source.actor.mana_atual, 7);
});

test("Escudo de Mana (ON_POWER_CAST) não dispara ao lançar outra Power (Bola de Fogo) — integração via aplicarAcao", async () => {
  const atacante = actor(1, { mana_atual: 100, inteligencia: 10 });
  const defensor = actor(2);
  const efeitoEscudo = row("GRANT_SHIELD", 18, { sourcePowerId: 1001, duration_turns: 2 });
  const gatilhosAtacante = new Map([
    ["ON_POWER_CAST", [efeitoEscudo]],
    ["ON_POWER_HIT", []],
  ]);
  // Lança uma Power DIFERENTE (id 2002, "Bola de Fogo") — Escudo de
  // Mana (id 1001) está só no loadout, nunca foi usada.
  await resolverTurnoComStatus({
    atacante,
    defensor,
    acao: { tipo: "power", power: { id: 2002, nome: "Bola de Fogo", custo_mana: 10, dano_base: 5, escala_atributo: "Inteligencia", valor_escala: 1, tipo_dano: "Magico" } },
    statusAtacante: [],
    statusDefensor: [],
    turno: 1,
    casterActorId: 1,
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    gatilhosAtacante,
  });
  assert.equal(atacante.powerCombatState.shield, null, "Escudo de Mana não foi lançada — nenhum escudo deveria existir");
});

test("Escudo de Mana (ON_POWER_CAST) dispara ao lançar ELA MESMA — integração via aplicarAcao", async () => {
  const atacante = actor(1, { mana_atual: 100, inteligencia: 10 });
  const defensor = actor(2);
  const efeitoEscudo = row("GRANT_SHIELD", 18, { sourcePowerId: 1001, duration_turns: 2 });
  const gatilhosAtacante = new Map([
    ["ON_POWER_CAST", [efeitoEscudo]],
    ["ON_POWER_HIT", []],
  ]);
  await resolverTurnoComStatus({
    atacante,
    defensor,
    acao: { tipo: "power", power: { id: 1001, nome: "Escudo de Mana", custo_mana: 18, dano_base: 0, cura_base: 0, escala_atributo: "Inteligencia", valor_escala: 0, tipo_dano: "Nenhum" } },
    statusAtacante: [],
    statusDefensor: [],
    turno: 1,
    casterActorId: 1,
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    gatilhosAtacante,
  });
  assert.equal(atacante.powerCombatState.shield.valor, 18);
});

test("ON_POWER_HIT de Luz Purificadora não dispara quando outra Power acerta — integração via aplicarAcao", async () => {
  const atacante = actor(1, { mana_atual: 100, inteligencia: 20 });
  const defensor = actor(2, { vida_atual: 200 });
  const efeitoDispel = row("DISPEL_BUFF", 0, { sourcePowerId: 3003, target: "ENEMY" });
  const gatilhosAtacante = new Map([
    ["ON_POWER_CAST", []],
    ["ON_POWER_HIT", [efeitoDispel]],
  ]);
  defensor.powerCombatState = { started: false, turn: 0, effects: [{ effect_key: "DAMAGE_DEALT_PCT", magnitude: 10, group: "buff-teste", dispellable: true }] };
  // Usa uma Power diferente (id 4004) que também causa dano/acerta —
  // Luz Purificadora (3003) não foi usada, então seu dispel não roda.
  await resolverTurnoComStatus({
    atacante,
    defensor,
    acao: { tipo: "power", power: { id: 4004, nome: "Outra Power", custo_mana: 5, dano_base: 20, escala_atributo: "Inteligencia", valor_escala: 1, tipo_dano: "Magico" } },
    statusAtacante: [],
    statusDefensor: [],
    turno: 1,
    casterActorId: 1,
    vidaMaxAtacante: 100,
    manaMaxAtacante: 100,
    defesaDefensor: 0,
    gatilhosAtacante,
  });
  assert.equal(defensor.powerCombatState.effects.length, 1, "dispel de Luz Purificadora não deveria ter disparado");
});
