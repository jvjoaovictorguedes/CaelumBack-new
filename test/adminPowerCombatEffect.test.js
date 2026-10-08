// Habilidades V2.0 (doc "Habilidades V2.0" §7/§17/§27) — Fase 4. CRUD de
// PowerCombatEffect no Admin: validação whitelist (effect_key/target/
// trigger/reapply_policy/condition_key fecham no catálogo), auditoria
// antes/depois, e o catálogo publicado que o frontend consome (nunca
// hardcode de effect_key lá).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const AdminActionLog = require("../src/models/AdminActionLog");
const adminPowerService = require("../src/services/adminPowerService");

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

const usuariosCriados = [];
const powersCriados = [];
test.after(async () => {
  if (!temBanco) return;
  if (powersCriados.length > 0) {
    await PowerCombatEffect.destroy({ where: { id_power: powersCriados } });
    await Power.destroy({ where: { id: powersCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  await sequelize.close();
});

async function criarAdmin() {
  const chave = sufixo();
  const admin = await User.create({
    username: `admin_combateffect_${chave}`,
    email: `admin_combateffect_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
  usuariosCriados.push(admin.id);
  return admin;
}

async function criarPower() {
  const power = await Power.create({
    nome: `PoderAdminCombatEffect_${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: "Passivo",
    custo_mana: 0,
    escala_atributo: "Forca",
    valor_escala: 0,
  });
  powersCriados.push(power.id);
  return power;
}

testeComBanco("addAdminPowerCombatEffect: cria com sucesso e registra auditoria antes/depois", async () => {
  const admin = await criarAdmin();
  const power = await criarPower();

  const efeito = await adminPowerService.addAdminPowerCombatEffect(
    power.id,
    { effect_key: "DAMAGE_DEALT_PCT", trigger: "PASSIVE", magnitude_base: 10 },
    { idAdmin: admin.id },
  );
  assert.equal(efeito.id_power, power.id);
  assert.equal(efeito.effect_key, "DAMAGE_DEALT_PCT");
  assert.equal(efeito.target, "SELF", "default do model");

  const log = await AdminActionLog.findOne({ where: { entidade: "PowerCombatEffect", id_entidade: efeito.id, acao: "criar" } });
  assert.ok(log, "precisa registrar auditoria de criação");
  assert.equal(log.dados_depois.effect_key, "DAMAGE_DEALT_PCT");
});

testeComBanco("addAdminPowerCombatEffect: rejeita effect_key fora do catálogo (falha fechado, §27)", async () => {
  const admin = await criarAdmin();
  const power = await criarPower();

  await assert.rejects(
    () => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "EFEITO_INVENTADO" }, { idAdmin: admin.id }),
    /effect_key/,
  );
});

testeComBanco("addAdminPowerCombatEffect: rejeita trigger/target/reapply_policy fora do catálogo", async () => {
  const admin = await criarAdmin();
  const power = await criarPower();

  await assert.rejects(
    () => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "DAMAGE_DEALT_PCT", trigger: "ON_INVENTADO" }, { idAdmin: admin.id }),
    /trigger/,
  );
  await assert.rejects(
    () => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "DAMAGE_DEALT_PCT", target: "TIME_TODO" }, { idAdmin: admin.id }),
    /target/,
  );
  await assert.rejects(
    () =>
      adminPowerService.addAdminPowerCombatEffect(
        power.id,
        { effect_key: "DAMAGE_DEALT_PCT", stack_group: "X", reapply_policy: "SOMAR_TUDO" },
        { idAdmin: admin.id },
      ),
    /reapply_policy/,
  );
});

testeComBanco("addAdminPowerCombatEffect: condition_key exige condition_config no contrato certo", async () => {
  const admin = await criarAdmin();
  const power = await criarPower();

  await assert.rejects(
    () =>
      adminPowerService.addAdminPowerCombatEffect(
        power.id,
        { effect_key: "DAMAGE_DEALT_PCT", condition_key: "SELF_HP_BELOW_PCT", condition_config: {} },
        { idAdmin: admin.id },
      ),
    /condition_config/,
  );

  const efeito = await adminPowerService.addAdminPowerCombatEffect(
    power.id,
    { effect_key: "DAMAGE_DEALT_PCT", condition_key: "SELF_HP_BELOW_PCT", condition_config: { limite_pct: 30 } },
    { idAdmin: admin.id },
  );
  assert.equal(efeito.condition_config.limite_pct, 30);
});

testeComBanco("updateAdminPowerCombatEffect: edita e registra antes/depois", async () => {
  const admin = await criarAdmin();
  const power = await criarPower();
  const efeito = await adminPowerService.addAdminPowerCombatEffect(
    power.id,
    { effect_key: "DEFENSE_FLAT", magnitude_base: 5 },
    { idAdmin: admin.id },
  );

  const atualizado = await adminPowerService.updateAdminPowerCombatEffect(efeito.id, { magnitude_base: 15 }, { idAdmin: admin.id });
  assert.equal(atualizado.magnitude_base, 15);

  const log = await AdminActionLog.findOne({ where: { entidade: "PowerCombatEffect", id_entidade: efeito.id, acao: "editar" } });
  assert.equal(log.dados_antes.magnitude_base, 5);
  assert.equal(log.dados_depois.magnitude_base, 15);
});

testeComBanco("removeAdminPowerCombatEffect: remove e registra auditoria", async () => {
  const admin = await criarAdmin();
  const power = await criarPower();
  const efeito = await adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "LIFESTEAL_PCT", magnitude_base: 10 }, { idAdmin: admin.id });

  const resultado = await adminPowerService.removeAdminPowerCombatEffect(efeito.id, { idAdmin: admin.id });
  assert.equal(resultado.removido, true);
  assert.equal(await PowerCombatEffect.findByPk(efeito.id), null);
});

testeComBanco("listAdminPowerCombatEffects: lista só os efeitos daquela Power", async () => {
  const admin = await criarAdmin();
  const power1 = await criarPower();
  const power2 = await criarPower();
  await adminPowerService.addAdminPowerCombatEffect(power1.id, { effect_key: "DAMAGE_DEALT_PCT", magnitude_base: 1 }, { idAdmin: admin.id });
  await adminPowerService.addAdminPowerCombatEffect(power2.id, { effect_key: "DAMAGE_DEALT_PCT", magnitude_base: 2 }, { idAdmin: admin.id });

  const lista = await adminPowerService.listAdminPowerCombatEffects(power1.id);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].id_power, power1.id);
});

test("combatEffectCatalog: publica os 4 catálogos completos, cada effect_key com label/unidade reais", () => {
  const catalogo = adminPowerService.combatEffectCatalog();
  assert.ok(catalogo.effectKeys.length > 0);
  for (const entrada of catalogo.effectKeys) {
    assert.ok(entrada.label, `effect_key ${entrada.key} precisa de label`);
    assert.ok(entrada.unidade, `effect_key ${entrada.key} precisa de unidade (nunca "potência base" genérico)`);
  }
  assert.ok(catalogo.targets.includes("SELF"));
  assert.ok(catalogo.triggers.some((t) => t.key === "PASSIVE"));
  assert.ok(catalogo.reapplyPolicies.includes("STRONGEST"));
  assert.ok(catalogo.conditions.some((c) => c.key === "SELF_HP_BELOW_PCT"));
  assert.ok(catalogo.contexts.some((c) => c.key === "PVE"));
});

test("combatEffectCatalog: metadados canônicos, schemas e suporte por combinação", () => {
  const { EFFECT_KEYS, METADADOS_DO_EFEITO } = require("../src/config/combatModifierConfig");
  const { CONFIG_ESPERADA } = require("../src/config/combatConditionConfig");
  const { TRIGGERS_REATIVOS_SUPORTADOS, REACTIVE_EFFECT_KEYS_IMPLEMENTADAS } = require("../src/services/combatModifierService");
  const catalog = adminPowerService.combatEffectCatalog();
  assert.deepEqual(catalog.effectKeys.map(effect => effect.key), EFFECT_KEYS);
  for (const effect of catalog.effectKeys) {
    assert.equal(effect.unidade, METADADOS_DO_EFEITO[effect.key].unidade);
    assert.ok(effect.previewTemplate.includes("{subject}"));
    for (const trigger of catalog.triggers) assert.ok(effect.supportByTrigger[trigger.key]);
  }
  const effect = key => catalog.effectKeys.find(effect => effect.key === key);
  assert.equal(effect("CLEANSE_STATUS").unidade, "SEM_MAGNITUDE");
  assert.equal(effect("CLEANSE_STATUS").configFields[0].key, "status_key");
  assert.equal(effect("CLEANSE_CATEGORY").configFields[0].key, "category");
  assert.equal(effect("DAMAGE_DEALT_PCT").supportByTrigger.PASSIVE.status, "FUNCTIONAL");
  assert.equal(effect("DAMAGE_DEALT_PCT").supportByTrigger.ON_HIT.status, "PARTIAL");
  assert.equal(effect("DAMAGE_DEALT_PCT").supportByTrigger.ON_CAST.status, "PARTIAL");
  assert.equal(effect("COOLDOWN_REDUCTION_TURNS").supportByTrigger.PASSIVE.status, "PARTIAL", "cooldown fora do PvE não pode aparecer como funcional");
  for (const trigger of TRIGGERS_REATIVOS_SUPORTADOS) for (const key of REACTIVE_EFFECT_KEYS_IMPLEMENTADAS) assert.equal(effect(key).supportByTrigger[trigger].status, "PARTIAL");
  for (const condition of catalog.conditions) {
    assert.deepEqual(condition.fields.map(field => field.key), CONFIG_ESPERADA[condition.key].campos);
  }
  assert.ok(catalog.contexts.every(context => PowerCombatEffect.rawAttributes[context.field]));
});

testeComBanco("combat effects: duração, chance e STACK são validados sem executar novos gatilhos", async () => {
  const admin = await criarAdmin(); const power = await criarPower(); const context = { idAdmin: admin.id };
  for (const duration of [0, -1, 1.5]) await assert.rejects(() => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "DAMAGE_DEALT_PCT", duration_turns: duration }, context), /duration_turns/);
  for (const chance of [0, 1_000_001, 0.5]) await assert.rejects(() => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "DAMAGE_DEALT_PCT", chance_ppm: chance }, context), /chance_ppm/);
  await assert.rejects(() => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "DAMAGE_DEALT_PCT", reapply_policy: "STACK" }, context), /STACK exige/);
  const effect = await adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "DAMAGE_DEALT_PCT", trigger: "ON_CAST", duration_turns: 2, chance_ppm: 200_000, reapply_policy: "STACK", max_stacks: 3 }, context);
  assert.equal(effect.duration_turns, 2); assert.equal(effect.chance_ppm, 200_000);
  await assert.rejects(() => adminPowerService.updateAdminPowerCombatEffect(effect.id, { max_stacks: null }, context), /STACK exige/);
  const updated = await adminPowerService.updateAdminPowerCombatEffect(effect.id, { duration_turns: null }, context);
  assert.equal(updated.duration_turns, null); assert.equal(updated.max_stacks, 3);
});

testeComBanco("combat effects: PATCH valida condição mesclada e preserva os outros campos", async () => {
  const admin = await criarAdmin(); const power = await criarPower(); const context = { idAdmin: admin.id };
  const original = await adminPowerService.addAdminPowerCombatEffect(power.id, {
    effect_key: "DEFENSE_FLAT", magnitude_base: -12, chance_ppm: 500_000, duration_turns: 3,
    scale_attribute: "Forca", scale_value: 0.5, scale_with_ability_level: true,
    condition_key: "TARGET_HP_BELOW_PCT", condition_config: { limite_pct: 40, legacy: "preservar" },
    config: { extension: "preservar" }, dispellable: false, allow_ranked: false, allow_world_boss: false,
  }, context);
  const updated = await adminPowerService.updateAdminPowerCombatEffect(original.id, { condition_config: { limite_pct: 25, legacy: "preservar" } }, context);
  assert.equal(updated.condition_config.limite_pct, 25);
  for (const key of ["magnitude_base", "chance_ppm", "duration_turns", "scale_attribute", "scale_value", "scale_with_ability_level", "config", "dispellable", "allow_ranked", "allow_world_boss"]) assert.deepEqual(updated[key], original[key], key);
  await assert.rejects(() => adminPowerService.updateAdminPowerCombatEffect(original.id, { condition_config: { limite_pct: 101 } }, context), /condition_config.limite_pct/);
  await assert.rejects(() => adminPowerService.updateAdminPowerCombatEffect(original.id, { condition_config: { thresholdPct: 40 } }, context), /limite_pct/);
});

testeComBanco("combat effects: CLEANSE tipado, contextos e autocomplete do banco", async () => {
  const admin = await criarAdmin(); const power = await criarPower(); const context = { idAdmin: admin.id };
  await assert.rejects(() => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "CLEANSE_STATUS", config: { status_key: "INVENTADO" } }, context), /config.status_key/);
  await assert.rejects(() => adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "CLEANSE_CATEGORY", config: { category: "INVENTADA" } }, context), /config.category/);
  const group = `CUSTOM_${sufixo()}`;
  const catalog = adminPowerService.combatEffectCatalog();
  const flags = Object.fromEntries(catalog.contexts.map(context => [context.field, false]));
  const effect = await adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "CLEANSE_STATUS", config: { status_key: "BURN", extension: true }, stack_group: group, ...flags }, context);
  for (const field of Object.keys(flags)) assert.equal(effect[field], false);
  assert.ok((await adminPowerService.listCombatEffectStackGroups()).includes(group));
  await assert.rejects(() => adminPowerService.updateAdminPowerCombatEffect(effect.id, { config: { status_key: "INVALIDO" } }, context), /config.status_key/);
  const updated = await adminPowerService.updateAdminPowerCombatEffect(effect.id, { ativo: false }, context);
  assert.deepEqual(updated.config, { status_key: "BURN", extension: true });
  const category = await adminPowerService.addAdminPowerCombatEffect(power.id, { effect_key: "CLEANSE_CATEGORY", config: { category: "DOT" } }, context);
  assert.equal(category.magnitude_base, 0);
});

testeComBanco("combat effects: edição compatível com STACK e configs legadas", async () => {
  const admin = await criarAdmin(); const power = await criarPower(); const context = { idAdmin: admin.id };
  const legacy = await PowerCombatEffect.create({ id_power: power.id, effect_key: "CLEANSE_STATUS", reapply_policy: "STACK", max_stacks: null, config: { legacy: 42 } });
  const updated = await adminPowerService.updateAdminPowerCombatEffect(legacy.id, { ativo: false, magnitude_base: 9 }, context);
  assert.equal(updated.ativo, false); assert.equal(updated.max_stacks, null); assert.deepEqual(updated.config, { legacy: 42 });
});
