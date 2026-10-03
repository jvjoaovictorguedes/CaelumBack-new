// IA de Combate PvE & Habilidades de Monstros V1 (§7/§8.4/§12.1) —
// Fase 9 (adapter World Boss, "compatibilidade primeiro"): a ÚNICA
// mudança nesta V1 é a Hard rule de Boss coletivo validada no cadastro
// de WorldBossAbility, compartilhando a MESMA combatContextPolicyService
// de Guild Boss — escolherHabilidade() do runtime continua intocado (o
// documento pede explicitamente pra manter a seleção atual e só
// compartilhar a policy, migrando depois de testes de paridade).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const WorldBossConfig = require("../src/models/WorldBossConfig");
const WorldBossAbility = require("../src/models/WorldBossAbility");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const Item = require("../src/models/Item");
require("../src/models/associations");
const adminWorldBossService = require("../src/services/adminWorldBossService");

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

async function criarConfigMinima() {
  const item = await Item.create({
    nome: `Item Golpe Final Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  const config = await WorldBossConfig.create({
    nome: `Ameaça Teste ${sufixo()}`,
    descricao: "teste",
    vida_base: 100000,
    mensagem_descoberta: "x",
    mensagem_convocacao: "x",
    id_item_golpe_final: item.id,
  });
  return { config, item };
}

testeComBanco("createAdminWorldBossAbility rejeita Power com HEAL_HP (Hard rule, nunca entra no banco)", async () => {
  const { config, item } = await criarConfigMinima();
  const powerCura = await Power.create({
    nome: `Power Cura World Boss ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    cura_base: 500,
  });

  await assert.rejects(
    adminWorldBossService.createAdminWorldBossAbility(config.id, { id_power: powerCura.id }, { idAdmin: 1 }),
    /Hard rule/,
  );

  const sobrou = await WorldBossAbility.findOne({ where: { id_world_boss_config: config.id } });
  assert.equal(sobrou, null, "nada deveria ter sido criado");

  await powerCura.destroy();
  await config.destroy();
  await item.destroy();
});

testeComBanco("createAdminWorldBossAbility rejeita Power com SHIELD (PowerCombatEffect GRANT_SHIELD)", async () => {
  const { config, item } = await criarConfigMinima();
  const powerShield = await Power.create({
    nome: `Power Shield World Boss ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
  });
  await PowerCombatEffect.create({ id_power: powerShield.id, effect_key: "GRANT_SHIELD", target: "SELF", magnitude_base: 50 });

  await assert.rejects(
    adminWorldBossService.createAdminWorldBossAbility(config.id, { id_power: powerShield.id }, { idAdmin: 1 }),
    /Hard rule/,
  );

  await powerShield.destroy();
  await config.destroy();
  await item.destroy();
});

testeComBanco("updateAdminWorldBossAbility rejeita trocar pra uma Power com REGEN_HP, mesmo sem reenviar id_power", async () => {
  const { config, item } = await criarConfigMinima();
  const powerDano = await Power.create({
    nome: `Power Dano World Boss ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    dano_base: 50,
  });
  const habilidade = await adminWorldBossService.createAdminWorldBossAbility(config.id, { id_power: powerDano.id }, { idAdmin: 1 });

  // Edita só peso_uso (não reenvia id_power) — validarHabilidade ainda
  // precisa checar a Power EXISTENTE da linha (idPowerExistente).
  const editada = await adminWorldBossService.updateAdminWorldBossAbility(config.id, habilidade.id, { peso_uso: 3 }, { idAdmin: 1 });
  assert.equal(editada.peso_uso, 3);

  const powerRegen = await Power.create({
    nome: `Power Regen World Boss ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
  });
  await PowerCombatEffect.create({ id_power: powerRegen.id, effect_key: "REGEN_HP_FLAT", target: "SELF", magnitude_base: 20, duration_turns: 3 });

  await assert.rejects(
    adminWorldBossService.updateAdminWorldBossAbility(config.id, habilidade.id, { id_power: powerRegen.id }, { idAdmin: 1 }),
    /Hard rule/,
  );

  await WorldBossAbility.destroy({ where: { id_world_boss_config: config.id } });
  await powerDano.destroy();
  await powerRegen.destroy();
  await config.destroy();
  await item.destroy();
});

testeComBanco("createAdminWorldBossAbility aceita Power de DAMAGE/DEBUFF_CONTROL normalmente", async () => {
  const { config, item } = await criarConfigMinima();
  const powerDano = await Power.create({
    nome: `Power Dano OK World Boss ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    dano_base: 80,
  });

  const habilidade = await adminWorldBossService.createAdminWorldBossAbility(config.id, { id_power: powerDano.id }, { idAdmin: 1 });
  assert.equal(habilidade.id_power, powerDano.id);

  await WorldBossAbility.destroy({ where: { id_world_boss_config: config.id } });
  await powerDano.destroy();
  await config.destroy();
  await item.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
