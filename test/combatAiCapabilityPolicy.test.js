// IA de Combate PvE & Habilidades de Monstros V1 (§3.1/§6.2/§7/§12.1)
// — Fase 2: powerCapabilityService (classificação) + combatContextPolicyService
// (capabilities permitidas por contexto, incluindo a Hard rule de Boss
// coletivo). Testes de bloqueio exigidos pela §12.1: "Guild Boss e World
// Boss rejeitam HEAL/HP_REGEN/SHIELD no Admin e no runtime" — aqui cobre
// a camada de política pura; o cadastro/Admin de verdade é testado em
// cima disto na Fase 4 (monsterAbilityService).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
require("../src/models/associations");
const { carregarPowerComEfeitos, classificarPower } = require("../src/services/powerCapabilityService");
const {
  capacidadePermitidaNoContexto,
  powerPermitidaNoContexto,
  motivoDeRejeicao,
} = require("../src/services/combatContextPolicyService");

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

async function criarPowerBase(overrides = {}) {
  return Power.create({
    nome: `Power Capability Teste ${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    dano_base: 0,
    cura_base: 0,
    ...overrides,
  });
}

testeComBanco("classificarPower: dano_base>0 vira DAMAGE, cura_base>0 vira HEAL_HP", async () => {
  const power = await criarPowerBase({ dano_base: 20, cura_base: 15 });
  const carregada = await carregarPowerComEfeitos(power.id);
  const capabilities = classificarPower(carregada);
  assert.ok(capabilities.has("DAMAGE"));
  assert.ok(capabilities.has("HEAL_HP"));
  await power.destroy();
});

testeComBanco("classificarPower: BURN (DoT) no inimigo vira DAMAGE; WEAKEN no inimigo vira DEBUFF_CONTROL", async () => {
  const power = await criarPowerBase();
  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "BURN",
    duration_turns: 3,
    potency_base: 5,
    target: "Enemy",
  });
  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "WEAKEN",
    duration_turns: 2,
    potency_base: 10,
    target: "Enemy",
  });
  const carregada = await carregarPowerComEfeitos(power.id);
  const capabilities = classificarPower(carregada);
  assert.ok(capabilities.has("DAMAGE"), "BURN é DoT, deveria contar como DAMAGE");
  assert.ok(capabilities.has("DEBUFF_CONTROL"), "WEAKEN não é DoT, deveria contar como DEBUFF_CONTROL");
  await power.destroy();
});

testeComBanco("classificarPower: GRANT_SHIELD/REGEN_HP_FLAT em SELF viram SHIELD/REGEN_HP", async () => {
  const power = await criarPowerBase();
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "GRANT_SHIELD", target: "SELF", magnitude_base: 50 });
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "REGEN_HP_FLAT", target: "SELF", magnitude_base: 10 });
  const carregada = await carregarPowerComEfeitos(power.id);
  const capabilities = classificarPower(carregada);
  assert.ok(capabilities.has("SHIELD"));
  assert.ok(capabilities.has("REGEN_HP"));
  await power.destroy();
});

testeComBanco("classificarPower: DISPEL_BUFF só vira DISPEL_TARGET quando mira inimigo, nunca em SELF", async () => {
  const power = await criarPowerBase();
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "DISPEL_BUFF", target: "ENEMY", magnitude_base: 0 });
  const powerSelf = await criarPowerBase();
  await PowerCombatEffect.create({ id_power: powerSelf.id, effect_key: "DISPEL_BUFF", target: "SELF", magnitude_base: 0 });

  const capsInimigo = classificarPower(await carregarPowerComEfeitos(power.id));
  const capsSelf = classificarPower(await carregarPowerComEfeitos(powerSelf.id));
  assert.ok(capsInimigo.has("DISPEL_TARGET"));
  assert.ok(!capsSelf.has("DISPEL_TARGET"), "dispelar o próprio buff não é uma capability de combate");

  await power.destroy();
  await powerSelf.destroy();
});

testeComBanco("classificarPower: CRIT_CHANCE_PCT em SELF vira OFFENSIVE_BUFF; DEFENSE_FLAT em SELF vira DEFENSIVE_BUFF", async () => {
  const power = await criarPowerBase();
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "CRIT_CHANCE_PCT", target: "SELF", magnitude_base: 15 });
  await PowerCombatEffect.create({ id_power: power.id, effect_key: "DEFENSE_FLAT", target: "SELF", magnitude_base: 20 });
  const carregada = await carregarPowerComEfeitos(power.id);
  const capabilities = classificarPower(carregada);
  assert.ok(capabilities.has("OFFENSIVE_BUFF"));
  assert.ok(capabilities.has("DEFENSIVE_BUFF"));
  await power.destroy();
});

test("combatContextPolicyService: Hard rule — HEAL_HP/REGEN_HP/SHIELD NUNCA permitidos em GUILD_BOSS/WORLD_BOSS, mesmo com explicitlyAllowed", () => {
  for (const contexto of ["GUILD_BOSS", "WORLD_BOSS"]) {
    for (const capability of ["HEAL_HP", "REGEN_HP", "SHIELD"]) {
      assert.equal(capacidadePermitidaNoContexto(capability, contexto), false, `${capability} em ${contexto} sem override`);
      assert.equal(
        capacidadePermitidaNoContexto(capability, contexto, { explicitlyAllowed: true }),
        false,
        `${capability} em ${contexto} NÃO pode ser liberado nem com explicitlyAllowed:true`,
      );
    }
  }
});

test("combatContextPolicyService: DEFENSIVE_BUFF/CLEANSE_SELF em Boss coletivo só com explicitlyAllowed", () => {
  for (const contexto of ["GUILD_BOSS", "WORLD_BOSS"]) {
    for (const capability of ["DEFENSIVE_BUFF", "CLEANSE_SELF"]) {
      assert.equal(capacidadePermitidaNoContexto(capability, contexto), false);
      assert.equal(capacidadePermitidaNoContexto(capability, contexto, { explicitlyAllowed: true }), true);
    }
  }
});

test("combatContextPolicyService: DAMAGE/DEBUFF_CONTROL/OFFENSIVE_BUFF/DISPEL_TARGET sempre permitidos em qualquer modo PvE", () => {
  for (const contexto of ["PVE", "PARTY", "GUILD_BOSS", "WORLD_BOSS"]) {
    for (const capability of ["DAMAGE", "DEBUFF_CONTROL", "OFFENSIVE_BUFF", "DISPEL_TARGET"]) {
      assert.equal(capacidadePermitidaNoContexto(capability, contexto), true, `${capability} em ${contexto}`);
    }
  }
});

test("combatContextPolicyService: PVE/PARTY permitem tudo sem precisar de explicitlyAllowed", () => {
  for (const contexto of ["PVE", "PARTY"]) {
    for (const capability of ["DEFENSIVE_BUFF", "HEAL_HP", "REGEN_HP", "SHIELD", "CLEANSE_SELF"]) {
      assert.equal(capacidadePermitidaNoContexto(capability, contexto), true, `${capability} em ${contexto}`);
    }
  }
});

test("powerPermitidaNoContexto: Power com capability MISTA (DAMAGE+SHIELD) fica de fora inteira de Guild Boss", () => {
  const capabilities = new Set(["DAMAGE", "SHIELD"]);
  assert.equal(powerPermitidaNoContexto(capabilities, "GUILD_BOSS"), false);
  assert.equal(powerPermitidaNoContexto(capabilities, "PVE"), true);
});

test("motivoDeRejeicao: explica a Hard rule vs. a falta de explicitlyAllowed com mensagens diferentes", () => {
  const motivoHard = motivoDeRejeicao(new Set(["SHIELD"]), "WORLD_BOSS");
  const motivoOverride = motivoDeRejeicao(new Set(["CLEANSE_SELF"]), "WORLD_BOSS");
  assert.match(motivoHard, /Hard rule/);
  assert.match(motivoOverride, /explicitamente permitida/);
  assert.equal(motivoDeRejeicao(new Set(["DAMAGE"]), "WORLD_BOSS"), null);
});

test("capacidadePermitidaNoContexto: rejeita capability/contexto desconhecidos", () => {
  assert.throws(() => capacidadePermitidaNoContexto("VOA", "PVE"), /Capability desconhecida/);
  assert.throws(() => capacidadePermitidaNoContexto("DAMAGE", "RANKED"), /Contexto de IA PvE desconhecido/);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
