// Rebalanceamento de Powers §29/§33 — invariantes de coerência que o
// Admin de Powers tem que recusar: Ativa de personagem sem cooldown,
// Passiva com Mana/cooldown, EXPLICIT sem affinity_id, Nenhum/Verdadeiro
// com afinidade ofensiva. Checa o estado FINAL (existente + payload),
// não o campo isolado que mudou na tela.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const Power = require("../src/models/Power");
const { DamageAffinityType } = require("../src/models/combatTypingModels");
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
  if (powersCriados.length > 0) await Power.destroy({ where: { id: powersCriados } });
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  await sequelize.close();
});

async function criarAdmin() {
  const chave = sufixo();
  const admin = await User.create({
    username: `admin_invpower_${chave}`,
    email: `admin_invpower_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
  usuariosCriados.push(admin.id);
  return admin;
}

async function pegarAfinidadeQualquer() {
  const afinidade = await DamageAffinityType.findOne({ order: [["id", "ASC"]] });
  if (!afinidade) throw new Error("damage_affinity_types vazio — rode as migrations/seeders antes dos testes.");
  return afinidade;
}

function payloadBase() {
  return {
    nome: `PoderInvariante_${sufixo()}`,
    descricao: "poder de teste de invariantes",
    escala_atributo: "Forca",
    valor_escala: 0,
  };
}

async function esperarCriarRejeitado(dados, padraoErro) {
  await assert.rejects(
    () => adminPowerService.createAdminPower(dados, { idAdmin: 1 }),
    padraoErro,
  );
}

testeComBanco("createAdminPower: rejeita Ativa CHARACTER sem cooldown", async () => {
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER" },
    /cooldown inteiro >= 1/,
  );
});

testeComBanco("createAdminPower: rejeita Ativa BOTH com cooldown=0", async () => {
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "BOTH", cooldown: 0 },
    /cooldown inteiro >= 1/,
  );
});

testeComBanco("createAdminPower: aceita Ativa CHARACTER com cooldown=1", async (t) => {
  const admin = await criarAdmin();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1 },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  assert.equal(power.cooldown, 1);
});

testeComBanco("createAdminPower: Ativa MONSTER sem cooldown não é afetada pela regra (exclusiva de CHARACTER/BOTH)", async (t) => {
  const admin = await criarAdmin();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "MONSTER" },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  assert.equal(power.cooldown, null);
});

testeComBanco("createAdminPower: rejeita Passiva com custo_mana != 0", async () => {
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Passivo", custo_mana: 5, cooldown: 0 },
    /custo_mana = 0/,
  );
});

testeComBanco("createAdminPower: rejeita Passiva com cooldown != 0", async () => {
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Passivo", custo_mana: 0, cooldown: 2 },
    /cooldown = 0/,
  );
});

testeComBanco("createAdminPower: aceita Passiva com custo_mana=0 e cooldown=0", async (t) => {
  const admin = await criarAdmin();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Passivo", custo_mana: 0, cooldown: 0 },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  assert.equal(power.custo_mana, 0);
  assert.equal(power.cooldown, 0);
});

testeComBanco("createAdminPower: rejeita affinity_mode EXPLICIT sem affinity_id", async () => {
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, tipo_dano: "Magico", affinity_mode: "EXPLICIT" },
    /EXPLICIT exige affinity_id/,
  );
});

testeComBanco("createAdminPower: aceita affinity_mode EXPLICIT com affinity_id", async (t) => {
  const admin = await criarAdmin();
  const afinidade = await pegarAfinidadeQualquer();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, tipo_dano: "Magico", affinity_mode: "EXPLICIT", affinity_id: afinidade.id },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  assert.equal(power.affinity_id, afinidade.id);
});

testeComBanco("createAdminPower: rejeita tipo_dano Verdadeiro com affinity_id ofensivo", async () => {
  const afinidade = await pegarAfinidadeQualquer();
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, tipo_dano: "Verdadeiro", affinity_id: afinidade.id },
    /não pode ter afinidade ofensiva/,
  );
});

testeComBanco("createAdminPower: rejeita tipo_dano Nenhum com added_affinity_id ofensivo", async () => {
  const afinidade = await pegarAfinidadeQualquer();
  await esperarCriarRejeitado(
    { ...payloadBase(), tipo_poder: "Passivo", custo_mana: 0, cooldown: 0, tipo_dano: "Nenhum", added_affinity_id: afinidade.id },
    /não pode ter afinidade ofensiva/,
  );
});

testeComBanco("updateAdminPower: rejeita setar affinity_id quando tipo_dano já salvo é Verdadeiro (sem mudar tipo_dano no mesmo PATCH)", async (t) => {
  const admin = await criarAdmin();
  const afinidade = await pegarAfinidadeQualquer();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 1, tipo_dano: "Verdadeiro" },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  await assert.rejects(
    () => adminPowerService.updateAdminPower(power.id, { affinity_id: afinidade.id }, { idAdmin: admin.id }),
    /não pode ter afinidade ofensiva/,
  );
});

testeComBanco("updateAdminPower: rejeita baixar cooldown de uma Ativa CHARACTER para 0", async (t) => {
  const admin = await criarAdmin();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 3 },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  await assert.rejects(
    () => adminPowerService.updateAdminPower(power.id, { cooldown: 0 }, { idAdmin: admin.id }),
    /cooldown inteiro >= 1/,
  );
});

testeComBanco("updateAdminPower: edição coerente não é afetada pelas novas invariantes", async (t) => {
  const admin = await criarAdmin();
  const power = await adminPowerService.createAdminPower(
    { ...payloadBase(), tipo_poder: "Ativo", usage_scope: "CHARACTER", cooldown: 2, dano_base: 10 },
    { idAdmin: admin.id },
  );
  powersCriados.push(power.id);
  const atualizado = await adminPowerService.updateAdminPower(power.id, { dano_base: 20 }, { idAdmin: admin.id });
  assert.equal(atualizado.dano_base, 20);
  assert.equal(atualizado.cooldown, 2);
});
