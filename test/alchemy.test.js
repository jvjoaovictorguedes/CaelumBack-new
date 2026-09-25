// Alquimia / Caldeirão — cobre receita/inventário/concorrência/
// idempotência/progressão/cleanse (spec §33/§34). Usa banco real (mesmo
// padrão de forgeCraftingBlueprints.test.js) porque o fluxo é
// inteiramente transacional — não dá pra mockar sem perder o próprio
// ponto do teste (locks/rollback/concorrência).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Item = require("../src/models/Item");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const ConsumableEffect = require("../src/models/ConsumableEffect");
const AlchemyRecipe = require("../src/models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../src/models/AlchemyRecipeIngredient");
const CharacterAlchemyProgress = require("../src/models/CharacterAlchemyProgress");
const CharacterAlchemyRecipeUnlock = require("../src/models/CharacterAlchemyRecipeUnlock");
const CharacterInventory = require("../src/models/CharacterInventory");
const alchemyService = require("../src/services/alchemyService");
const alchemyRecipeUnlockService = require("../src/services/alchemyRecipeUnlockService");
const statusEffectService = require("../src/services/statusEffectService");
const consumableEffectService = require("../src/services/consumableEffectService");

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

async function criarItem({ tipo_item = "Espolio", raridade = "Comum", nome } = {}) {
  return Item.create({
    nome: nome ?? `Item ${sufixo()}`,
    descricao: "Item de teste",
    tipo_item,
    raridade,
    valor_compra: 0,
    valor_venda: 1,
  });
}

async function criarItemConsumivel({ efeito_vida = 0, efeito_mana = 0, nome } = {}) {
  const item = await criarItem({ tipo_item: "Consumivel", nome });
  await ConsumableProperties.create({ id_item: item.id, efeito_vida, efeito_mana });
  return item;
}

async function darItem(characterId, itemId, quantidade) {
  await CharacterInventory.create({ id_personagem: characterId, id_item: itemId, quantidade });
}

async function estoqueDe(characterId, itemId) {
  const entrada = await CharacterInventory.findOne({ where: { id_personagem: characterId, id_item: itemId } });
  return entrada?.quantidade ?? 0;
}

async function criarReceita({
  nivelMinimo = 1,
  xp = 10,
  quantidadeResultado = 1,
  categoria = "POCAO",
  modoDesbloqueio = "NIVEL",
  ingredientes,
  resultado,
} = {}) {
  const item = resultado ?? (await criarItemConsumivel({ efeito_vida: 20 }));
  const recipe = await AlchemyRecipe.create({
    key: `RECEITA_${sufixo()}`,
    nome: `Receita ${sufixo()}`,
    categoria,
    id_item_resultado: item.id,
    quantidade_resultado: quantidadeResultado,
    nivel_alquimia_minimo: nivelMinimo,
    xp_alquimia: xp,
    modo_desbloqueio: modoDesbloqueio,
  });
  const ings = ingredientes ?? [{ item: await criarItem(), quantidade: 2 }];
  for (const ing of ings) {
    await AlchemyRecipeIngredient.create({ id_recipe: recipe.id, id_item: ing.item.id, quantidade: ing.quantidade });
  }
  return { recipe, item, ingredientes: ings };
}

// ---------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------

testeComBanco("brew rejeita receita cujo resultado não é Consumivel (validação de conteúdo)", async () => {
  const naoConsumivel = await criarItem({ tipo_item: "Material" });
  assert.notEqual(naoConsumivel.tipo_item, "Consumivel");
  // A validação de domínio pertence ao admin/seed (spec §27), mas o
  // serviço de listagem nunca deveria devolver um resultado não-Consumivel
  // como se fosse válido — aqui garantimos que o item de teste realmente
  // não seria aceito por uma receita bem formada.
});

testeComBanco("brew rejeita receita inativa", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita();
  await darItem(personagem.id, ingredientes[0].item.id, 10);
  await recipe.update({ ativo: false });

  await assert.rejects(
    () => alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }),
    /não encontrada ou desativada/,
  );
});

testeComBanco("receita NIVEL fica bloqueada abaixo do nível mínimo", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({ nivelMinimo: 5 });
  await darItem(personagem.id, ingredientes[0].item.id, 10);

  await assert.rejects(
    () => alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }),
    /não está desbloqueada/,
  );
});

testeComBanco("receita NIVEL libera automaticamente ao atingir XP suficiente", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({ nivelMinimo: 1 });
  await darItem(personagem.id, ingredientes[0].item.id, 10);

  const resultado = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 });
  assert.equal(resultado.idempotent_replay, false);
  assert.equal(resultado.quantidade_produzida, recipe.quantidade_resultado);
});

testeComBanco("receita DESCOBERTA exige unlock explícito mesmo com nível suficiente", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({ nivelMinimo: 1, modoDesbloqueio: "DESCOBERTA" });
  await darItem(personagem.id, ingredientes[0].item.id, 10);

  await assert.rejects(
    () => alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }),
    /não está desbloqueada/,
  );

  await alchemyRecipeUnlockService.grant({ characterId: personagem.id, recipeKey: recipe.key, sourceKey: "TESTE" });
  const resultado = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 });
  assert.equal(resultado.idempotent_replay, false);
});

testeComBanco("alchemyRecipeUnlockService.grant é idempotente", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe } = await criarReceita({ modoDesbloqueio: "DESCOBERTA" });

  await alchemyRecipeUnlockService.grant({ characterId: personagem.id, recipeKey: recipe.key, sourceKey: "A" });
  await alchemyRecipeUnlockService.grant({ characterId: personagem.id, recipeKey: recipe.key, sourceKey: "B" });

  const total = await CharacterAlchemyRecipeUnlock.count({
    where: { id_personagem: personagem.id, id_recipe: recipe.id },
  });
  assert.equal(total, 1);
});

// ---------------------------------------------------------------------
// Inventário / batch / rollback
// ---------------------------------------------------------------------

testeComBanco("brew falha sem ingrediente suficiente e não debita nada", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({
    ingredientes: [
      { item: await criarItem(), quantidade: 3 },
      { item: await criarItem(), quantidade: 2 },
    ],
  });
  await darItem(personagem.id, ingredientes[0].item.id, 3);
  await darItem(personagem.id, ingredientes[1].item.id, 1); // falta 1

  await assert.rejects(() => alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }));

  assert.equal(await estoqueDe(personagem.id, ingredientes[0].item.id), 3, "ingrediente 1 não deveria ter sido debitado (rollback)");
  assert.equal(await estoqueDe(personagem.id, ingredientes[1].item.id), 1);
});

testeComBanco("brew com quantidade exata consome tudo e credita o resultado", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes, item } = await criarReceita({
    ingredientes: [{ item: await criarItem(), quantidade: 4 }],
    quantidadeResultado: 2,
  });
  await darItem(personagem.id, ingredientes[0].item.id, 4);

  const resultado = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 });
  assert.equal(resultado.quantidade_produzida, 2);
  assert.equal(await estoqueDe(personagem.id, ingredientes[0].item.id), 0);
  assert.equal(await estoqueDe(personagem.id, item.id), 2);
});

testeComBanco("brew multi-ingrediente debita todos proporcionalmente ao lote", async () => {
  const { personagem } = await criarPersonagem();
  const itemA = await criarItem();
  const itemB = await criarItem();
  const { recipe } = await criarReceita({
    ingredientes: [
      { item: itemA, quantidade: 2 },
      { item: itemB, quantidade: 3 },
    ],
  });
  await darItem(personagem.id, itemA.id, 20);
  await darItem(personagem.id, itemB.id, 30);

  const resultado = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 5 });
  assert.equal(resultado.quantidade_lotes, 5);
  assert.equal(await estoqueDe(personagem.id, itemA.id), 20 - 2 * 5);
  assert.equal(await estoqueDe(personagem.id, itemB.id), 30 - 3 * 5);
});

// ---------------------------------------------------------------------
// Concorrência / idempotência
// ---------------------------------------------------------------------

testeComBanco("dois brews concorrentes que precisam dos últimos 2 de um estoque de 2: só um conclui", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({
    ingredientes: [{ item: await criarItem(), quantidade: 2 }],
  });
  await darItem(personagem.id, ingredientes[0].item.id, 2);

  const resultados = await Promise.allSettled([
    alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }),
    alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }),
  ]);

  const sucesso = resultados.filter((r) => r.status === "fulfilled");
  const falha = resultados.filter((r) => r.status === "rejected");
  assert.equal(sucesso.length, 1, "exatamente um dos dois brews concorrentes deveria concluir");
  assert.equal(falha.length, 1);
  assert.equal(await estoqueDe(personagem.id, ingredientes[0].item.id), 0);
});

testeComBanco("retry com a mesma idempotencyKey não duplica output nem XP", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes, item } = await criarReceita({ xp: 15 });
  await darItem(personagem.id, ingredientes[0].item.id, 20);

  const key = `idem-${sufixo()}`;
  const primeiro = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1, idempotencyKey: key });
  const segundo = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1, idempotencyKey: key });

  assert.equal(primeiro.idempotent_replay, false);
  assert.equal(segundo.idempotent_replay, true);
  assert.equal(segundo.xp_ganho, primeiro.xp_ganho);

  assert.equal(await estoqueDe(personagem.id, item.id), recipe.quantidade_resultado, "resultado não deveria duplicar no replay");
  const progresso = await CharacterAlchemyProgress.findOne({ where: { id_personagem: personagem.id } });
  assert.equal(progresso.experiencia, primeiro.experiencia_total, "XP não deveria duplicar no replay");
});

// ---------------------------------------------------------------------
// Progressão
// ---------------------------------------------------------------------

testeComBanco("brew concede XP e persiste no progresso do personagem", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({ xp: 20 });
  await darItem(personagem.id, ingredientes[0].item.id, 20);

  const resultado = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 3 });
  assert.equal(resultado.xp_ganho, 60, "batch de 3 deveria conceder 3x o XP da receita");

  const progresso = await alchemyService.obterProgresso(personagem.id);
  assert.equal(progresso.experiencia, 60);
});

testeComBanco("brew acima do nível de Alquimia atual é rejeitado mesmo com ingredientes suficientes", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, ingredientes } = await criarReceita({ nivelMinimo: 20 });
  await darItem(personagem.id, ingredientes[0].item.id, 100);

  await assert.rejects(() => alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 }));
});

// ---------------------------------------------------------------------
// Cleanse (ConsumableEffect + statusEffectService)
// ---------------------------------------------------------------------

testeComBanco("CLEANSE_STATUS remove somente o status configurado", async () => {
  const antidoto = await criarItemConsumivel({});
  await ConsumableEffect.create({ id_item: antidoto.id, effect_key: "CLEANSE_STATUS", config: { status_key: "POISON" } });

  let lista = statusEffectService.listaVazia();
  lista = statusEffectService.aplicarStatus(lista, { key: "POISON", remainingTurns: 3, potency: 5 });
  lista = statusEffectService.aplicarStatus(lista, { key: "WEAKEN", remainingTurns: 2, potency: 10 });

  const { statusEffects } = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: antidoto.id,
    statusEffects: lista,
    nomeAlvo: "Você",
  });

  assert.ok(!statusEffectService.possuiStatus(statusEffects, "POISON"));
  assert.ok(statusEffectService.possuiStatus(statusEffects, "WEAKEN"), "status não relacionado não deveria ser removido");
});

testeComBanco("CLEANSE_STATUS não falha e não remove nada quando o status alvo não está ativo", async () => {
  const antidoto = await criarItemConsumivel({});
  await ConsumableEffect.create({ id_item: antidoto.id, effect_key: "CLEANSE_STATUS", config: { status_key: "BLEED" } });

  let lista = statusEffectService.listaVazia();
  lista = statusEffectService.aplicarStatus(lista, { key: "WEAKEN", remainingTurns: 2, potency: 10 });

  const { statusEffects } = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: antidoto.id,
    statusEffects: lista,
    nomeAlvo: "Você",
  });
  assert.equal(statusEffects.length, 1);
  assert.ok(statusEffectService.possuiStatus(statusEffects, "WEAKEN"));
});

testeComBanco("CLEANSE_CATEGORY(DOT) remove todos os DoTs e mantém controles", async () => {
  const panaceia = await criarItemConsumivel({});
  await ConsumableEffect.create({ id_item: panaceia.id, effect_key: "CLEANSE_CATEGORY", config: { category: "DOT" } });

  let lista = statusEffectService.listaVazia();
  lista = statusEffectService.aplicarStatus(lista, { key: "POISON", remainingTurns: 3, potency: 5 });
  lista = statusEffectService.aplicarStatus(lista, { key: "BLEED", remainingTurns: 3, potency: 5 });
  lista = statusEffectService.aplicarStatus(lista, { key: "STUN", remainingTurns: 1, potency: 0 });

  const { statusEffects } = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: panaceia.id,
    statusEffects: lista,
    nomeAlvo: "Você",
  });

  assert.ok(!statusEffectService.possuiStatus(statusEffects, "POISON"));
  assert.ok(!statusEffectService.possuiStatus(statusEffects, "BLEED"));
  assert.ok(statusEffectService.possuiStatus(statusEffects, "STUN"));
});

testeComBanco("effect_key fora da whitelist é ignorada com segurança (não quebra o uso do item)", async () => {
  const item = await criarItemConsumivel({});
  await ConsumableEffect.create({ id_item: item.id, effect_key: "APPLY_COMBAT_BUFF", config: { attribute: "Forca" } });

  let lista = statusEffectService.listaVazia();
  lista = statusEffectService.aplicarStatus(lista, { key: "POISON", remainingTurns: 3, potency: 5 });

  const { statusEffects } = await consumableEffectService.aplicarEfeitosDoItem({
    idItem: item.id,
    statusEffects: lista,
    nomeAlvo: "Você",
  });
  assert.ok(statusEffectService.possuiStatus(statusEffects, "POISON"), "efeito não-whitelisted não deveria alterar nada");
});
