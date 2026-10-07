// Habilidades V2.0 (doc "Habilidades V2.0" §7/§9/§11/§12) — Fase 4.
// combatModifierService.js: resolução pura (stacking/reapply policy) +
// integração real com CharacterAbilities/Power/PowerCombatEffect via
// banco.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const combatModifierService = require("../src/services/combatModifierService");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

const powersCriados = [];
const personagensCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (powersCriados.length > 0) {
    await PowerCombatEffect.destroy({ where: { id_power: powersCriados } });
    await CharacterAbilities.destroy({ where: { id_power: powersCriados } });
    await Power.destroy({ where: { id: powersCriados } });
  }
  await sequelize.close();
});

async function criarPower(overrides = {}) {
  const power = await Power.create({
    nome: `PoderCombatEffectTeste_${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: "Passivo",
    custo_mana: 0,
    escala_atributo: "Forca",
    valor_escala: 0,
    ...overrides,
  });
  powersCriados.push(power.id);
  return power;
}

// ---------------------------------------------------------------------
// resolverModificadores (puro) — stacking/reapply policy
// ---------------------------------------------------------------------

test("resolverModificadores: sem stack_group, mesma effect_key soma livremente (mecanismos diferentes podem coexistir)", () => {
  const mapa = combatModifierService.resolverModificadores([
    { effect_key: "DAMAGE_DEALT_PCT", magnitude: 10, stack_group: null },
    { effect_key: "DAMAGE_DEALT_PCT", magnitude: 5, stack_group: null },
  ]);
  assert.equal(mapa.get("DAMAGE_DEALT_PCT"), 15);
});

test("resolverModificadores: STRONGEST — maior magnitude do grupo prevalece, nunca soma (bug real do combatBuffService.aplicarBuff generalizado)", () => {
  const mapa = combatModifierService.resolverModificadores([
    { effect_key: "CRIT_CHANCE_PCT", magnitude: 5, stack_group: "OFFENSE_CRITICAL", reapply_policy: "STRONGEST" },
    { effect_key: "CRIT_CHANCE_PCT", magnitude: 8, stack_group: "OFFENSE_CRITICAL", reapply_policy: "STRONGEST" },
  ]);
  assert.equal(mapa.get("CRIT_CHANCE_PCT"), 8);
});

test("resolverModificadores: STACK soma até max_stacks instâncias, nunca mais", () => {
  const mapa = combatModifierService.resolverModificadores([
    { effect_key: "DEFENSE_FLAT", magnitude: 3, stack_group: "ARMOR_STACK", reapply_policy: "STACK", max_stacks: 2 },
    { effect_key: "DEFENSE_FLAT", magnitude: 3, stack_group: "ARMOR_STACK", reapply_policy: "STACK", max_stacks: 2 },
    { effect_key: "DEFENSE_FLAT", magnitude: 3, stack_group: "ARMOR_STACK", reapply_policy: "STACK", max_stacks: 2 },
  ]);
  assert.equal(mapa.get("DEFENSE_FLAT"), 6, "3 instâncias de 3, mas max_stacks=2 -> só 6, nunca 9");
});

test("resolverModificadores: grupos diferentes nunca se misturam", () => {
  const mapa = combatModifierService.resolverModificadores([
    { effect_key: "DAMAGE_DEALT_PCT", magnitude: 10, stack_group: "GRUPO_A", reapply_policy: "STRONGEST" },
    { effect_key: "DAMAGE_DEALT_PCT", magnitude: -5, stack_group: "GRUPO_B", reapply_policy: "STRONGEST" },
  ]);
  assert.equal(mapa.get("DAMAGE_DEALT_PCT"), 5, "10 do grupo A + (-5) do grupo B, cada grupo resolvido separado");
});

test("magnitudeEfetiva: escala por atributo e pela curva 1-10 de abilityLevelService quando habilitado", () => {
  const efeito = { magnitude_base: 2, scale_attribute: "Inteligencia", scale_value: 0.5, scale_with_ability_level: true };
  const personagem = { inteligencia: 20 };
  // 2 + 20*0.5 = 12, * multiplicador do nível 5 (1.45, ver abilityLevelService)
  const valor = combatModifierService.magnitudeEfetiva(efeito, personagem, 5);
  assert.ok(Math.abs(valor - 12 * 1.45) < 1e-6);
});

test("multiplicadorDanoSaida/bonusDefesa/regenVidaDoTurno: getters leem o mapa certo e ignoram o resto", () => {
  const mapa = new Map([
    ["DAMAGE_DEALT_PCT", 20],
    ["DEFENSE_FLAT", 7],
    ["REGEN_HP_PERCENT", 5],
  ]);
  assert.equal(combatModifierService.multiplicadorDanoSaida(mapa), 1.2);
  assert.equal(combatModifierService.bonusDefesa(mapa), 7);
  assert.equal(combatModifierService.regenVidaDoTurno(mapa, 200), 10);
});

test("resistenciaStatusPct: respeita o mesmo teto global de 75% que combatBuffService já usa", () => {
  const mapa = new Map([["STATUS_RESISTANCE_PCT", 200]]);
  assert.equal(combatModifierService.resistenciaStatusPct(mapa), 75);
});

test("curaPorLifesteal: usa o dano EFETIVO na Vida, não dano bruto", () => {
  const mapa = new Map([["LIFESTEAL_PCT", 50]]);
  assert.equal(combatModifierService.curaPorLifesteal(mapa, 0), 0, "sem dano efetivo, sem cura");
  assert.equal(combatModifierService.curaPorLifesteal(mapa, 40), 20);
});

// ---------------------------------------------------------------------
// resolverModificadoresDoPersonagem — integração real via banco
// ---------------------------------------------------------------------

async function novoPersonagem() {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  personagensCriados.push(personagem.id);
  return personagem;
}

testeComBanco(
  "resolverModificadoresDoPersonagem: Power Passiva aprendida concede o modificador sempre (nunca ocupa o loadout de 5)",
  async () => {
    const personagem = await novoPersonagem();
    const power = await criarPower({ tipo_poder: "Passivo" });
    await PowerCombatEffect.create({
      id_power: power.id,
      effect_key: "DAMAGE_DEALT_PCT",
      trigger: "PASSIVE",
      magnitude_base: 12,
      ativo: true,
    });
    await CharacterAbilities.create({
      id_personagem: personagem.id,
      id_power: power.id,
      is_active: false, // passiva nunca precisa estar "ativa" pra contar
    });

    const mapa = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
    assert.equal(mapa.get("DAMAGE_DEALT_PCT"), 12);
  },
);

testeComBanco(
  "resolverModificadoresDoPersonagem: Power ATIVA com efeito PASSIVE só conta enquanto marcada no loadout (is_active)",
  async () => {
    const personagem = await novoPersonagem();
    const power = await criarPower({ tipo_poder: "Ativo", custo_mana: 5 });
    await PowerCombatEffect.create({
      id_power: power.id,
      effect_key: "CRIT_CHANCE_PCT",
      trigger: "PASSIVE",
      magnitude_base: 5,
      ativo: true,
    });
    await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: false });

    const mapaInativa = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
    assert.equal(mapaInativa.get("CRIT_CHANCE_PCT") ?? 0, 0, "Power Ativa fora do loadout não concede o efeito PASSIVE");

    await CharacterAbilities.update(
      { is_active: true },
      { where: { id_personagem: personagem.id, id_power: power.id } },
    );
    const mapaAtiva = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
    assert.equal(mapaAtiva.get("CRIT_CHANCE_PCT"), 5);
  },
);

testeComBanco(
  "resolverModificadoresDoPersonagem: respeita o contexto (allow_pvp_casual=false não vaza pra PVP_CASUAL)",
  async () => {
    const personagem = await novoPersonagem();
    const power = await criarPower({ tipo_poder: "Passivo" });
    await PowerCombatEffect.create({
      id_power: power.id,
      effect_key: "LIFESTEAL_PCT",
      trigger: "PASSIVE",
      magnitude_base: 10,
      ativo: true,
      allow_pvp_casual: false,
    });
    await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id });

    const mapaPve = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
    assert.equal(mapaPve.get("LIFESTEAL_PCT"), 10);

    const mapaPvp = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVP_CASUAL");
    assert.equal(mapaPvp.get("LIFESTEAL_PCT") ?? 0, 0);
  },
);

testeComBanco(
  "resolverModificadoresDoPersonagem: efeito ativo=false (admin desligou) nunca conta",
  async () => {
    const personagem = await novoPersonagem();
    const power = await criarPower({ tipo_poder: "Passivo" });
    await PowerCombatEffect.create({
      id_power: power.id,
      effect_key: "DAMAGE_DEALT_PCT",
      trigger: "PASSIVE",
      magnitude_base: 50,
      ativo: false,
    });
    await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id });

    const mapa = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
    assert.equal(mapa.get("DAMAGE_DEALT_PCT") ?? 0, 0);
  },
);

testeComBanco("resolverModificadoresDoPersonagem: personagem sem nenhuma Power aprendida devolve mapa vazio", async () => {
  const personagem = await novoPersonagem();
  const mapa = await combatModifierService.resolverModificadoresDoPersonagem(personagem, "PVE");
  assert.equal(mapa.size, 0);
});

test("resolverModificadoresDoPersonagem: lança erro claro pra contexto desconhecido", async () => {
  await assert.rejects(
    () => combatModifierService.resolverModificadoresDoPersonagem({ id: 1 }, "CONTEXTO_INVALIDO"),
    /Contexto de combate desconhecido/,
  );
});


testeComBanco("catálogo reativo carrega todos os eventos, condições e alvos; respeita loadout/contexto/ativo", async () => {
  const personagem = await novoPersonagem();
  const power = await criarPower({ tipo_poder: "Ativo" });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true });
  for (const trigger of combatModifierService.TRIGGERS_REATIVOS_SUPORTADOS) {
    await PowerCombatEffect.create({ id_power: power.id, trigger, effect_key: "DEFENSE_FLAT", magnitude_base: 7,
      target: "ENEMY", duration_turns: 2, condition_key: "TARGET_HP_BELOW_PCT", condition_config: { limite_pct: 50 },
      config: { extension: true }, allow_ranked: false });
  }
  await PowerCombatEffect.create({ id_power: power.id, trigger: "ON_CAST", effect_key: "REGEN_HP_FLAT", ativo: false });
  const map = await combatModifierService.resolverGatilhosDoPersonagem(personagem, "PVE");
  assert.equal(map.size, 10);
  for (const rows of map.values()) {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].target, "ENEMY");
    assert.equal(rows[0].sourcePowerId, power.id);
    assert.equal(rows[0].duration_turns, 2);
    assert.deepEqual(rows[0].condition_config, { limite_pct: 50 });
    assert.deepEqual(rows[0].config, { extension: true });
  }
  const ranked = await combatModifierService.resolverGatilhosDoPersonagem(personagem, "RANKED");
  assert.ok([...ranked.values()].every((rows) => rows.length === 0));
  await CharacterAbilities.update({ is_active: false }, { where: { id_personagem: personagem.id, id_power: power.id } });
  const inactive = await combatModifierService.resolverGatilhosDoPersonagem(personagem, "PVE");
  assert.ok([...inactive.values()].every((rows) => rows.length === 0));
});
