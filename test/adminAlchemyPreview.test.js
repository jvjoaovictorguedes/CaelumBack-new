// Painel Administrativo — Preview server-side (Caldeirão §19). Simula o
// uso de um item com vida/mana/buffs/escudo HIPOTÉTICOS, sem nunca ler ou
// gravar um Character de verdade — reaproveita o mesmo
// consumableEffectService.aplicarEfeitosDoItem que PvE/fora-de-combate usam.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const ConsumableEffect = require("../src/models/ConsumableEffect");
const adminAlchemyService = require("../src/services/adminAlchemyService");

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

const itensCriados = [];
const efeitosCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await ConsumableEffect.destroy({ where: { id: efeitosCriados.length ? efeitosCriados : [-1] } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  if (temBanco) await sequelize.close();
});

async function criarItemConsumivel(nome = "Poção de Teste") {
  const item = await Item.create({
    nome: `${nome} ${Date.now()}_${Math.random()}`,
    descricao: "Item de teste do preview de Alquimia.",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

async function criarEfeito(idItem, dados) {
  const efeito = await adminAlchemyService.createAdminConsumableEffect(idItem, dados, { idAdmin: 1, req: {} });
  efeitosCriados.push(efeito.id);
  return efeito;
}

testeComBanco("previewAdminConsumableEffects: 404 pra item inexistente", async () => {
  await assert.rejects(
    () => adminAlchemyService.previewAdminConsumableEffects(999999999, {}),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("previewAdminConsumableEffects: sem hipotético usa vida/mana 100/100 por padrão", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, { effect_key: "HEAL_HP_FLAT", magnitude: 30 });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, {});
  assert.equal(preview.hipotetico.vidaMaxima, 100);
  assert.equal(preview.hipotetico.vidaAtual, 100);
  assert.equal(preview.antes.vidaAtual, 100);
  // já estava no máximo — cura real é 0 (clampada), nunca o valor bruto configurado.
  assert.equal(preview.curaVida, 0);
  assert.equal(preview.depois.vidaAtual, 100);
});

testeComBanco("previewAdminConsumableEffects: HEAL_HP_FLAT cura o delta real, respeitando o hipotético informado", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, { effect_key: "HEAL_HP_FLAT", magnitude: 40 });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, { vidaAtual: 50, vidaMaxima: 120 });
  assert.equal(preview.curaVida, 40);
  assert.equal(preview.depois.vidaAtual, 90);
  assert.equal(preview.antes.vidaAtual, 50);
});

testeComBanco("previewAdminConsumableEffects: HEAL_HP_PERCENT usa vidaMaxima hipotética, nunca uma real", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, { effect_key: "HEAL_HP_PERCENT", magnitude: 50 });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, { vidaAtual: 10, vidaMaxima: 200 });
  assert.equal(preview.curaVida, 100);
  assert.equal(preview.depois.vidaAtual, 110);
});

testeComBanco("previewAdminConsumableEffects: rejeita vidaMaxima/manaMaxima hipotéticos <= 0", async () => {
  const item = await criarItemConsumivel();
  await assert.rejects(
    () => adminAlchemyService.previewAdminConsumableEffects(item.id, { vidaMaxima: 0 }),
    /vidaMaxima e manaMaxima/i,
  );
});

testeComBanco("previewAdminConsumableEffects: APPLY_COMBAT_BUFF aparece no resumo depois (nunca antes)", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, {
    effect_key: "APPLY_COMBAT_BUFF",
    magnitude: 20,
    duration_turns: 3,
    config: { atributo: "DANO_SAIDA_PCT" },
  });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, {});
  assert.equal(preview.antes.resumo.dano_saida_multiplicador, 1);
  assert.equal(preview.depois.resumo.dano_saida_multiplicador, 1.2);
  assert.equal(preview.depois.combatBuffs.length, 1);
});

testeComBanco("previewAdminConsumableEffects: GRANT_SHIELD aparece no escudo depois", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, { effect_key: "GRANT_SHIELD", magnitude: 50, duration_turns: 2 });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, {});
  assert.equal(preview.antes.escudo, null);
  assert.deepEqual(preview.depois.escudo, { valor: 50, remainingTurns: 2 });
});

testeComBanco("previewAdminConsumableEffects: STATUS_RESISTANCE_PCT mostra a CHANCE calculada (com teto), nunca sorteia", async () => {
  const item = await criarItemConsumivel();
  // Acima do teto global (75) de propósito — preview precisa mostrar já
  // capado, igual o motor de combate faz de verdade.
  await criarEfeito(item.id, {
    effect_key: "APPLY_COMBAT_BUFF",
    magnitude: 90,
    duration_turns: 5,
    config: { atributo: "STATUS_RESISTANCE_PCT" },
  });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, {});
  assert.equal(preview.depois.resumo.status_resistance_chance, 75);
});

testeComBanco("previewAdminConsumableEffects: REGEN_HP_PERCENT usa a vidaMaxima hipotética no resumo", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, {
    effect_key: "APPLY_COMBAT_BUFF",
    magnitude: 10,
    duration_turns: 4,
    config: { atributo: "REGEN_HP_PERCENT" },
  });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, { vidaMaxima: 200 });
  assert.equal(preview.depois.resumo.regen_vida_por_turno, 20);
});

testeComBanco("previewAdminConsumableEffects: log consolida múltiplos efeitos do mesmo item", async () => {
  const item = await criarItemConsumivel();
  await criarEfeito(item.id, { effect_key: "HEAL_HP_FLAT", magnitude: 10 });
  await criarEfeito(item.id, { effect_key: "GRANT_SHIELD", magnitude: 15, duration_turns: 1 });

  const preview = await adminAlchemyService.previewAdminConsumableEffects(item.id, { vidaAtual: 50, vidaMaxima: 100 });
  assert.equal(preview.curaVida, 10);
  assert.ok(preview.log.some((linha) => linha.includes("escudo")));
});
