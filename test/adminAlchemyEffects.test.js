// Painel Administrativo — Construtor de Efeitos (Caldeirão §12). Cobre
// listEffectTypes + CRUD de ConsumableEffect via adminAlchemyService,
// seguindo os mesmos helpers de fixture de test/adminAlchemy.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
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
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste do Construtor de Efeitos.",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

async function criarItemMaterial(nome = "Ingrediente de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Ingrediente de teste do Construtor de Efeitos.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

test("listEffectTypes: devolve metadados pra cada effect_key da whitelist", () => {
  const tipos = adminAlchemyService.listEffectTypes();
  const porChave = Object.fromEntries(tipos.map((t) => [t.effect_key, t]));

  assert.ok(porChave.HEAL_HP_FLAT, "deveria incluir HEAL_HP_FLAT");
  assert.equal(porChave.HEAL_HP_FLAT.exige_duracao, false);
  assert.equal(porChave.HEAL_HP_FLAT.exige_magnitude, true);

  assert.ok(porChave.APPLY_COMBAT_BUFF, "deveria incluir APPLY_COMBAT_BUFF");
  assert.equal(porChave.APPLY_COMBAT_BUFF.exige_duracao, true);
  assert.equal(porChave.APPLY_COMBAT_BUFF.exige_atributo_buff, true);
  assert.ok(porChave.APPLY_COMBAT_BUFF.atributos_buff.includes("DANO_SAIDA_PCT"));

  assert.ok(porChave.GRANT_SHIELD, "deveria incluir GRANT_SHIELD");
  assert.equal(porChave.GRANT_SHIELD.exige_duracao, true);

  assert.ok(porChave.CLEANSE_STATUS, "deveria incluir CLEANSE_STATUS");
  assert.equal(porChave.CLEANSE_STATUS.exige_status_key, true);
  assert.equal(porChave.CLEANSE_STATUS.exige_magnitude, false);

  assert.ok(porChave.CLEANSE_CATEGORY, "deveria incluir CLEANSE_CATEGORY");
  assert.deepEqual(porChave.CLEANSE_CATEGORY.categorias, ["DOT", "CONTROLE"]);
});

testeComBanco("createAdminConsumableEffect: exige Item do tipo Consumível", async () => {
  const itemMaterial = await criarItemMaterial();
  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        itemMaterial.id,
        { effect_key: "HEAL_HP_FLAT", magnitude: 10 },
        { idAdmin: 1, req: {} },
      ),
    /Consumível/i,
  );
});

testeComBanco("createAdminConsumableEffect: 404 pra item inexistente", async () => {
  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        999999999,
        { effect_key: "HEAL_HP_FLAT", magnitude: 10 },
        { idAdmin: 1, req: {} },
      ),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("createAdminConsumableEffect: effect_key fora da whitelist é rejeitada", async () => {
  const item = await criarItemConsumivel();
  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "EFFECT_KEY_INEXISTENTE", magnitude: 10 },
        { idAdmin: 1, req: {} },
      ),
    /effect_key desconhecida/i,
  );
});

testeComBanco("createAdminConsumableEffect: HEAL_HP_FLAT/RESTORE_MANA_* exigem magnitude != 0", async () => {
  const item = await criarItemConsumivel();
  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "HEAL_HP_FLAT", magnitude: 0 },
        { idAdmin: 1, req: {} },
      ),
    /magnitude diferente de 0/i,
  );
});

testeComBanco("createAdminConsumableEffect: APPLY_COMBAT_BUFF exige duration_turns > 0 e config.atributo válido", async () => {
  const item = await criarItemConsumivel();

  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "APPLY_COMBAT_BUFF", magnitude: 10, config: { atributo: "DEFESA_FLAT" } },
        { idAdmin: 1, req: {} },
      ),
    /duration_turns > 0/i,
  );

  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "APPLY_COMBAT_BUFF", magnitude: 10, duration_turns: 3, config: { atributo: "ATRIBUTO_INVALIDO" } },
        { idAdmin: 1, req: {} },
      ),
    /config\.atributo/i,
  );

  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "APPLY_COMBAT_BUFF", magnitude: 15, duration_turns: 3, config: { atributo: "DEFESA_FLAT" } },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito.id);
  assert.equal(efeito.effect_key, "APPLY_COMBAT_BUFF");
  assert.equal(efeito.duration_turns, 3);
});

testeComBanco("createAdminConsumableEffect: GRANT_SHIELD exige duration_turns > 0", async () => {
  const item = await criarItemConsumivel();
  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "GRANT_SHIELD", magnitude: 20 },
        { idAdmin: 1, req: {} },
      ),
    /duration_turns > 0/i,
  );
});

testeComBanco("createAdminConsumableEffect: CLEANSE_STATUS exige config.status_key válida", async () => {
  const item = await criarItemConsumivel();

  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "CLEANSE_STATUS", config: { status_key: "CHAVE_INVALIDA" } },
        { idAdmin: 1, req: {} },
      ),
    /config\.status_key/i,
  );

  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "CLEANSE_STATUS", config: { status_key: "POISON" } },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito.id);
  assert.equal(efeito.effect_key, "CLEANSE_STATUS");
});

testeComBanco("createAdminConsumableEffect: CLEANSE_CATEGORY exige config.category em DOT/CONTROLE", async () => {
  const item = await criarItemConsumivel();

  await assert.rejects(
    () =>
      adminAlchemyService.createAdminConsumableEffect(
        item.id,
        { effect_key: "CLEANSE_CATEGORY", config: { category: "BUFF" } },
        { idAdmin: 1, req: {} },
      ),
    /config\.category/i,
  );

  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "CLEANSE_CATEGORY", config: { category: "DOT" } },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito.id);
  assert.equal(efeito.effect_key, "CLEANSE_CATEGORY");
});

testeComBanco("listAdminConsumableEffects: lista só os efeitos do item pedido, em ordem de id", async () => {
  const item = await criarItemConsumivel();
  const outroItem = await criarItemConsumivel();

  const efeito1 = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "HEAL_HP_FLAT", magnitude: 10 },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito1.id);
  const efeito2 = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "RESTORE_MANA_FLAT", magnitude: 5 },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito2.id);
  const efeitoOutroItem = await adminAlchemyService.createAdminConsumableEffect(
    outroItem.id,
    { effect_key: "HEAL_HP_FLAT", magnitude: 99 },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeitoOutroItem.id);

  const lista = await adminAlchemyService.listAdminConsumableEffects(item.id);
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((e) => e.id), [efeito1.id, efeito2.id]);
});

testeComBanco("listAdminConsumableEffects: 404 pra item inexistente", async () => {
  await assert.rejects(
    () => adminAlchemyService.listAdminConsumableEffects(999999999),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("updateAdminConsumableEffect: revalida a config final (efeito + patch combinados)", async () => {
  const item = await criarItemConsumivel();
  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "APPLY_COMBAT_BUFF", magnitude: 10, duration_turns: 2, config: { atributo: "DANO_SAIDA_PCT" } },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito.id);

  // Tentar zerar duration_turns sem trocar o effect_key deve continuar
  // batendo na mesma regra de APPLY_COMBAT_BUFF (valor final = patch
  // combinado com o que já estava salvo, nunca só o patch isolado).
  await assert.rejects(
    () => adminAlchemyService.updateAdminConsumableEffect(efeito.id, { duration_turns: 0 }, { idAdmin: 1, req: {} }),
    /duration_turns > 0/i,
  );

  const atualizado = await adminAlchemyService.updateAdminConsumableEffect(
    efeito.id,
    { magnitude: 25, ativo: false },
    { idAdmin: 1, req: {} },
  );
  assert.equal(atualizado.magnitude, 25);
  assert.equal(atualizado.ativo, false);
  assert.equal(atualizado.config.atributo, "DANO_SAIDA_PCT");
});

testeComBanco("updateAdminConsumableEffect: 404 pra efeito inexistente", async () => {
  await assert.rejects(
    () => adminAlchemyService.updateAdminConsumableEffect(999999999, { magnitude: 1 }, { idAdmin: 1, req: {} }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("deleteAdminConsumableEffect: remove o efeito e some da listagem", async () => {
  const item = await criarItemConsumivel();
  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    item.id,
    { effect_key: "HEAL_HP_PERCENT", magnitude: 30 },
    { idAdmin: 1, req: {} },
  );

  const resultado = await adminAlchemyService.deleteAdminConsumableEffect(efeito.id, { idAdmin: 1, req: {} });
  assert.equal(resultado.id, efeito.id);

  const lista = await adminAlchemyService.listAdminConsumableEffects(item.id);
  assert.equal(lista.length, 0);
});

testeComBanco("deleteAdminConsumableEffect: 404 pra efeito inexistente", async () => {
  await assert.rejects(
    () => adminAlchemyService.deleteAdminConsumableEffect(999999999, { idAdmin: 1, req: {} }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("listAdminAlchemyRecipes: receita vem com efeitos_consumivel do item_resultado anexados", async () => {
  const AlchemyRecipe = require("../src/models/AlchemyRecipe");
  const itemResultado = await criarItemConsumivel();
  const efeito = await adminAlchemyService.createAdminConsumableEffect(
    itemResultado.id,
    { effect_key: "HEAL_HP_FLAT", magnitude: 40 },
    { idAdmin: 1, req: {} },
  );
  efeitosCriados.push(efeito.id);

  const receita = await adminAlchemyService.createAdminAlchemyRecipe(
    {
      key: `receita_${sufixo()}`,
      nome: "Receita Com Efeito",
      categoria: "POCAO",
      id_item_resultado: itemResultado.id,
      modo_desbloqueio: "NIVEL",
      ingredientes: [],
    },
    { idAdmin: 1, req: {} },
  );

  try {
    assert.equal(receita.efeitos_consumivel.length, 1);
    assert.equal(receita.efeitos_consumivel[0].id, efeito.id);
  } finally {
    const AlchemyRecipeIngredient = require("../src/models/AlchemyRecipeIngredient");
    await AlchemyRecipeIngredient.destroy({ where: { id_recipe: receita.id } });
    await AlchemyRecipe.destroy({ where: { id: receita.id } });
  }
});
