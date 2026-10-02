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
