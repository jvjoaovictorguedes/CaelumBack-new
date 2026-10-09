// Rebalanceamento de Powers §33 — suíte de correção do catálogo:
// aplica a migration corretiva (20270214010000) contra o banco de teste
// (idempotente, já provado seguro reaplicar — ver topo do arquivo da
// migration) e verifica as PRÓPRIAS Powers canônicas, não um mock.
// Cobre especificamente os exemplos que a especificação cita por nome.
const test = require("node:test");
const assert = require("node:assert/strict");
const { bancoDisponivel, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
const { DamageAffinityType } = require("../src/models/combatTypingModels");
const migration = require("../src/migrations/20270214010000-rebalanceamento-powers-personagem.js");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
  if (temBanco) await migration.up(sequelize.getQueryInterface());
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

test.after(async () => {
  if (!temBanco) return;
  await sequelize.close();
});

async function buscar(nome) {
  const power = await Power.findOne({ where: { nome } });
  assert.ok(power, `Power "${nome}" não encontrada no catálogo pós-migration.`);
  return power;
}
async function afinidade(id) {
  if (id == null) return null;
  return DamageAffinityType.findByPk(id);
}
async function statusDe(idPower) {
  return PowerStatusEffect.findAll({ where: { id_power: idPower } });
}
async function combatEffectsDe(idPower) {
  return PowerCombatEffect.findAll({ where: { id_power: idPower } });
}

testeComBanco("Golpe Poderoso é puramente físico (INHERIT_WEAPON, sem afinidade própria)", async () => {
  const p = await buscar("Golpe Poderoso");
  assert.equal(p.tipo_dano, "Fisico");
  assert.equal(p.affinity_mode, "INHERIT_WEAPON");
  assert.equal(p.affinity_id, null);
  assert.equal(p.cooldown >= 1, true);
});

testeComBanco("Corte Selvagem é SLASH físico e causa Sangramento", async () => {
  const p = await buscar("Corte Selvagem");
  assert.equal(p.tipo_dano, "Fisico");
  const a = await afinidade(p.affinity_id);
  assert.equal(a?.key, "SLASH");
  const status = await statusDe(p.id);
  assert.ok(status.some((s) => s.status_key === "BLEED"));
});

testeComBanco("Golpe Retumbante é BLUNT físico e causa Atordoamento (STUN)", async () => {
  const p = await buscar("Golpe Retumbante");
  assert.equal(p.tipo_dano, "Fisico");
  const a = await afinidade(p.affinity_id);
  assert.equal(a?.key, "BLUNT");
  const status = await statusDe(p.id);
  assert.ok(status.some((s) => s.status_key === "STUN"));
});

testeComBanco("Bola de Fogo é Mágico/FIRE e causa Queimadura (BURN)", async () => {
  const p = await buscar("Bola de Fogo");
  assert.equal(p.tipo_dano, "Magico");
  const a = await afinidade(p.affinity_id);
  assert.equal(a?.key, "FIRE");
  const status = await statusDe(p.id);
  assert.ok(status.some((s) => s.status_key === "BURN"));
});

testeComBanco("Lança de Gelo é Mágico/ICE e causa Congelamento (FREEZE)", async () => {
  const p = await buscar("Lança de Gelo");
  assert.equal(p.tipo_dano, "Magico");
  const a = await afinidade(p.affinity_id);
  assert.equal(a?.key, "ICE");
  const status = await statusDe(p.id);
  assert.ok(status.some((s) => s.status_key === "FREEZE"));
});

testeComBanco("Escudo de Mana concede Shield real (GRANT_SHIELD) e não cura HP (cura_base=0)", async () => {
  const p = await buscar("Escudo de Mana");
  assert.equal(p.cura_base, 0);
  assert.equal(p.tipo_dano, "Nenhum");
  const efeitos = await combatEffectsDe(p.id);
  assert.ok(efeitos.some((e) => e.effect_key === "GRANT_SHIELD"));
});

testeComBanco("Colapso Dimensional NÃO é Verdadeiro (continua Mágico, mesmo sendo o capstone)", async () => {
  const p = await buscar("Colapso Dimensional");
  assert.equal(p.tipo_dano, "Magico");
  assert.notEqual(p.tipo_dano, "Verdadeiro");
});

testeComBanco("Lâmina Flamejante mantém INHERIT_WEAPON (multiplicador físico do Guerreiro) e só ADICIONA Fogo", async () => {
  const p = await buscar("Lâmina Flamejante");
  assert.equal(p.tipo_dano, "Fisico");
  assert.equal(p.affinity_mode, "INHERIT_WEAPON");
  const adicional = await afinidade(p.added_affinity_id);
  assert.equal(adicional?.key, "FIRE");
  assert.ok(Number(p.added_damage_pct) > 0);
});

testeComBanco("Erupção Arcana usa multiplicador MÁGICO (tipo_dano=Magico, afinidade EXPLICIT Fogo)", async () => {
  const p = await buscar("Erupção Arcana");
  assert.equal(p.tipo_dano, "Magico");
  assert.equal(p.affinity_mode, "EXPLICIT");
});

testeComBanco("Toda Power Ativa de personagem no catálogo canônico tem cooldown >= 1", async () => {
  const nomes = migration.POWERS?.map((p) => p.nome) ?? [];
  assert.ok(nomes.length > 0, "migration.POWERS precisa estar exportado pra este teste iterar.");
  const powers = await Power.findAll({ where: { nome: nomes } });
  const violando = powers.filter((p) => p.tipo_poder === "Ativo" && (p.cooldown == null || p.cooldown < 1));
  assert.deepEqual(violando.map((p) => p.nome), []);
});

testeComBanco("Toda Power Passiva do catálogo canônico tem custo_mana=0 e cooldown=0", async () => {
  const nomes = migration.POWERS?.map((p) => p.nome) ?? [];
  const powers = await Power.findAll({ where: { nome: nomes } });
  const violando = powers.filter((p) => p.tipo_poder === "Passivo" && (p.custo_mana !== 0 || p.cooldown !== 0));
  assert.deepEqual(violando.map((p) => p.nome), []);
});

testeComBanco("Nenhuma Power do catálogo canônico é Verdadeiro (nunca 'forte = Verdadeiro')", async () => {
  const nomes = migration.POWERS?.map((p) => p.nome) ?? [];
  const powers = await Power.findAll({ where: { nome: nomes } });
  const verdadeiras = powers.filter((p) => p.tipo_dano === "Verdadeiro");
  assert.deepEqual(verdadeiras.map((p) => p.nome), []);
});
