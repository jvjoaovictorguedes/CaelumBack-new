// IA de Combate PvE & Habilidades de Monstros V1 (§5/§6/§12.1) — Fase 3:
// combatAiService PURO (sem banco, só fixtures). Cobre os testes
// obrigatórios da §12.1 que dizem respeito ao motor de decisão:
// "monstro sem MonsterAbility mantém comportamento atual", "IA nunca
// usa Power sem Mana/em cooldown/fora da fase", "IA não cura em HP
// cheio, não limpa sem debuff e não dispela alvo sem buff", e os dois
// exemplos de aleatoriedade controlada do §5.4.
const test = require("node:test");
const assert = require("node:assert/strict");

const { chooseAction, selecionarAlvos, avaliarCondicao } = require("../src/services/combatAiService");

function ator(overrides = {}) {
  return {
    id: "monstro-1",
    hpAtual: 100,
    hpMaxima: 100,
    manaAtual: 50,
    manaMaxima: 50,
    statuses: [],
    buffs: [],
    ...overrides,
  };
}

function oponente(overrides = {}) {
  return { id: "jogador-1", hpAtual: 100, hpMaxima: 100, alive: true, statuses: [], buffs: [], ...overrides };
}

function habilidade(overrides = {}) {
  return {
    id: 1,
    powerId: 10,
    capabilities: new Set(),
    prioridadeBase: 0,
    pesoUso: 1,
    manaCost: 0,
    cooldownAtual: 0,
    targetPolicy: "PLAYER",
    isPassive: false,
    conditions: [],
    ...overrides,
  };
}

test("monstro sem nenhuma MonsterAbility sempre escolhe ataque básico (comportamento legado preservado)", () => {
  const decisao = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator(),
    opponents: [oponente()],
    abilities: [],
    turn: 1,
  });
  assert.equal(decisao.type, "attack");
  assert.equal(decisao.abilityId, null);
});

test("IA nunca usa Power sem Mana suficiente", () => {
  const cara = habilidade({ id: 2, manaCost: 999, prioridadeBase: 1000, capabilities: new Set(["DAMAGE"]) });
  const decisao = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator({ manaAtual: 10 }),
    opponents: [oponente()],
    abilities: [cara],
    turn: 1,
  });
  assert.equal(decisao.type, "attack", "sem Mana pra pagar, cai pro ataque básico mesmo com prioridade altíssima");
});

test("IA nunca usa Power em cooldown", () => {
  const emCooldown = habilidade({ id: 3, cooldownAtual: 2, prioridadeBase: 1000 });
  const decisao = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator(),
    opponents: [oponente()],
    abilities: [emCooldown],
    turn: 1,
  });
  assert.equal(decisao.type, "attack");
});

test("IA nunca usa Power fora da fase permitida", () => {
  const foraDeFase = habilidade({ id: 4, allowedPhases: ["FASE_2"], prioridadeBase: 1000 });
  const decisao = chooseAction({
    context: "WORLD_BOSS",
    aiProfile: "BOSS",
    actor: ator(),
    opponents: [oponente()],
    abilities: [foraDeFase],
    phase: "FASE_1",
    turn: 1,
  });
  assert.equal(decisao.type, "attack");

  const dentroDaFase = chooseAction({
    context: "WORLD_BOSS",
    aiProfile: "BOSS",
    actor: ator(),
    opponents: [oponente()],
    abilities: [foraDeFase],
    phase: "FASE_2",
    turn: 1,
  });
  assert.equal(dentroDaFase.type, "power");
});

test("IA não cura em HP cheio", () => {
  const cura = habilidade({ id: 5, capabilities: new Set(["HEAL_HP"]), prioridadeBase: 1000, targetPolicy: "SELF" });
  const decisao = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator({ hpAtual: 100, hpMaxima: 100 }),
    opponents: [oponente()],
    abilities: [cura],
    turn: 1,
  });
  assert.equal(decisao.type, "attack");

  const decisaoComDano = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator({ hpAtual: 40, hpMaxima: 100 }),
    opponents: [oponente()],
    abilities: [cura],
    turn: 1,
  });
  assert.equal(decisaoComDano.type, "power", "com HP não-cheio a cura volta a ser elegível");
});

test("IA não usa Cleanse sem status removível em si", () => {
  const cleanse = habilidade({ id: 6, capabilities: new Set(["CLEANSE_SELF"]), prioridadeBase: 1000, targetPolicy: "SELF" });
  const semStatus = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator({ statuses: [] }),
    opponents: [oponente()],
    abilities: [cleanse],
    turn: 1,
  });
  assert.equal(semStatus.type, "attack");

  const comStatus = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator({ statuses: ["POISON"] }),
    opponents: [oponente()],
    abilities: [cleanse],
    turn: 1,
  });
  assert.equal(comStatus.type, "power");
});

test("IA não dispela alvo sem buff elegível", () => {
  const dispel = habilidade({ id: 7, capabilities: new Set(["DISPEL_TARGET"]), prioridadeBase: 1000 });
  const semBuff = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator(),
    opponents: [oponente({ buffs: [] })],
    abilities: [dispel],
    turn: 1,
  });
  assert.equal(semBuff.type, "attack");

  const comBuff = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator(),
    opponents: [oponente({ buffs: ["DAMAGE_DEALT_PCT"] })],
    abilities: [dispel],
    turn: 1,
  });
  assert.equal(comBuff.type, "power");
});

test("Hard rule de Boss coletivo: SHIELD nunca é escolhido em GUILD_BOSS/WORLD_BOSS mesmo com prioridade altíssima", () => {
  const shield = habilidade({ id: 8, capabilities: new Set(["SHIELD"]), prioridadeBase: 99999, targetPolicy: "SELF" });
  for (const context of ["GUILD_BOSS", "WORLD_BOSS"]) {
    const decisao = chooseAction({
      context,
      aiProfile: "BOSS",
      actor: ator({ hpAtual: 10 }),
      opponents: [oponente()],
      abilities: [shield],
      turn: 1,
    });
    assert.equal(decisao.type, "attack", `${context} nunca pode escolher SHIELD`);
  }
});

test("condition required:false falhando não exclui a ability, só não soma score_bonus", () => {
  const ability = habilidade({
    id: 9,
    prioridadeBase: 10,
    conditions: [{ key: "SELF_HP_BELOW_PCT", config: { thresholdPct: 10 }, scoreBonus: 500, required: false }],
  });
  const decisao = chooseAction({
    context: "PVE",
    aiProfile: "ELITE_BOSS",
    actor: ator({ hpAtual: 100 }),
    opponents: [oponente()],
    abilities: [ability],
    turn: 1,
  });
  // prioridade 10 (ability) vs 0 (ataque básico), jitter ELITE_BOSS=2 — ability ainda vence.
  assert.equal(decisao.type, "power");
});

test("condition required:true falhando exclui a ability inteira", () => {
  const ability = habilidade({
    id: 10,
    prioridadeBase: 99999,
    conditions: [{ key: "SELF_HP_BELOW_PCT", config: { thresholdPct: 10 }, scoreBonus: 0, required: true }],
  });
  const decisao = chooseAction({
    context: "PVE",
    aiProfile: "BASIC",
    actor: ator({ hpAtual: 100 }),
    opponents: [oponente()],
    abilities: [ability],
    turn: 1,
  });
  assert.equal(decisao.type, "attack", "condição required falhou (HP não está abaixo de 10%), ability inelegível");
});

test("§5.4 exemplo 1 — Shield 112 vs Dispel 78/Poison 73/Attack 69: Shield vence sempre (gap > jitter)", () => {
  const abilities = [
    habilidade({ id: "shield", capabilities: new Set(["SHIELD"]), prioridadeBase: 112, targetPolicy: "SELF" }),
    habilidade({ id: "dispel", capabilities: new Set(["DISPEL_TARGET"]), prioridadeBase: 78 }),
    habilidade({ id: "poison", capabilities: new Set(["DEBUFF_CONTROL"]), prioridadeBase: 73 }),
  ];
  for (let i = 0; i < 30; i++) {
    const decisao = chooseAction({
      context: "PVE",
      aiProfile: "BASIC", // jitter máximo 18 — gap 112-78=34 > 18
      actor: ator({ hpAtual: 10 }),
      opponents: [oponente({ buffs: ["X"] })],
      abilities,
      turn: 1,
    });
    assert.equal(decisao.abilityId, "shield");
  }
});

test("§5.4 exemplo 2 — Poison 73/Attack(ability) 69/Weaken 67: scores próximos variam entre si", () => {
  const abilities = [
    habilidade({ id: "poison", capabilities: new Set(["DEBUFF_CONTROL"]), prioridadeBase: 73 }),
    habilidade({ id: "attack-like", capabilities: new Set(["DAMAGE"]), prioridadeBase: 69 }),
    habilidade({ id: "weaken", capabilities: new Set(["DEBUFF_CONTROL"]), prioridadeBase: 67 }),
  ];
  const escolhidos = new Set();
  for (let i = 0; i < 60; i++) {
    const decisao = chooseAction({
      context: "PVE",
      aiProfile: "BASIC", // jitter 18 — todos os três estão dentro da banda do melhor (73-18=55)
      actor: ator(),
      opponents: [oponente()],
      abilities,
      turn: 1,
    });
    escolhidos.add(decisao.abilityId);
  }
  assert.ok(escolhidos.size > 1, "scores próximos deveriam produzir mais de uma escolha ao longo de várias rodadas");
});

test("selecionarAlvos: LOWEST_HP/HIGHEST_HP/RANDOM/ALL/SELF", () => {
  const atorFixo = ator();
  const oponentes = [
    oponente({ id: "a", hpAtual: 80, hpMaxima: 100 }),
    oponente({ id: "b", hpAtual: 20, hpMaxima: 100 }),
    oponente({ id: "c", hpAtual: 50, hpMaxima: 100, alive: false }),
  ];
  assert.deepEqual(selecionarAlvos("LOWEST_HP", { actor: atorFixo, opponents: oponentes }), ["b"]);
  assert.deepEqual(selecionarAlvos("HIGHEST_HP", { actor: atorFixo, opponents: oponentes }), ["a"]);
  assert.deepEqual(selecionarAlvos("ALL", { actor: atorFixo, opponents: oponentes }).sort(), ["a", "b"]);
  assert.deepEqual(selecionarAlvos("SELF", { actor: atorFixo, opponents: oponentes }), [atorFixo.id]);
  const alvoRandom = selecionarAlvos("RANDOM", { actor: atorFixo, opponents: oponentes });
  assert.ok(["a", "b"].includes(alvoRandom[0]), "RANDOM nunca escolhe um oponente morto");
});

test("avaliarCondicao: TARGET_HP_BELOW_PCT é existencial sobre oponentes vivos", () => {
  const condicao = { key: "TARGET_HP_BELOW_PCT", config: { thresholdPct: 30 } };
  assert.equal(
    avaliarCondicao(condicao, {
      actor: ator(),
      opponents: [oponente({ hpAtual: 90, hpMaxima: 100 }), oponente({ hpAtual: 10, hpMaxima: 100, id: "b" })],
    }),
    true,
  );
  assert.equal(
    avaliarCondicao(condicao, { actor: ator(), opponents: [oponente({ hpAtual: 90, hpMaxima: 100 })] }),
    false,
  );
});
