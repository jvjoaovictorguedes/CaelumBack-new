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
