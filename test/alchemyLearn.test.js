// Alquimia V2 — receita física/Livro de Fórmulas (spec Caldeirão V2 §8/
// §10/§20). Banco real, mesmo padrão de alchemy.test.js: o fluxo de
// aprender é transacional (trava item + grava unlock) e a visibilidade
// do Livro de Fórmulas depende do estado real do personagem no banco.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Item = require("../src/models/Item");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const AlchemyRecipe = require("../src/models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../src/models/AlchemyRecipeIngredient");
const CharacterAlchemyProgress = require("../src/models/CharacterAlchemyProgress");
const CharacterAlchemyRecipeUnlock = require("../src/models/CharacterAlchemyRecipeUnlock");
const CharacterInventory = require("../src/models/CharacterInventory");
const alchemyRecipeService = require("../src/services/alchemyRecipeService");
const alchemyLearnService = require("../src/services/alchemyLearnService");
const alchemyRecipeUnlockService = require("../src/services/alchemyRecipeUnlockService");

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
const receitasCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (receitasCriadas.length > 0) {
    await CharacterAlchemyRecipeUnlock.destroy({ where: { id_recipe: receitasCriadas } });
    await AlchemyRecipeIngredient.destroy({ where: { id_recipe: receitasCriadas } });
    await AlchemyRecipe.destroy({ where: { id: receitasCriadas } });
  }
  if (itensCriados.length > 0) {
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await ConsumableProperties.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
});

async function criarItem({ tipo_item = "Espolio", nome } = {}) {
  const item = await Item.create({
    nome: nome ?? `Item ${sufixo()}`,
    descricao: "Item de teste",
    tipo_item,
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 1,
  });
  itensCriados.push(item.id);
  return item;
}

async function criarItemConsumivel() {
  const item = await criarItem({ tipo_item: "Consumivel" });
  await ConsumableProperties.create({ id_item: item.id, efeito_vida: 10 });
  return item;
}

async function darItem(characterId, itemId, quantidade) {
  await CharacterInventory.destroy({ where: { id_personagem: characterId, id_item: itemId } });
  if (quantidade > 0) await CharacterInventory.create({ id_personagem: characterId, id_item: itemId, quantidade });
}

async function estoqueDe(characterId, itemId) {
  const entrada = await CharacterInventory.findOne({ where: { id_personagem: characterId, id_item: itemId } });
  return entrada?.quantidade ?? 0;
}

async function criarReceitaDescoberta({
  nivelMinimo = 1,
  consomeAoAprender = true,
  pistaPublica = null,
  ingredientes,
} = {}) {
  const itemReceita = await criarItem({ tipo_item: "Receita" });
  const itemResultado = await criarItemConsumivel();
  const recipe = await AlchemyRecipe.create({
    key: `FORMULA_${sufixo()}`,
    nome: `Fórmula ${sufixo()}`,
    descricao: "Receita secreta de teste",
    categoria: "ELIXIR",
    id_item_resultado: itemResultado.id,
    quantidade_resultado: 1,
    nivel_alquimia_minimo: nivelMinimo,
    xp_alquimia: 50,
    modo_desbloqueio: "DESCOBERTA",
    id_item_receita: itemReceita.id,
    consome_ao_aprender: consomeAoAprender,
    pista_publica: pistaPublica,
  });
  receitasCriadas.push(recipe.id);
  const ings = ingredientes ?? [{ item: await criarItem(), quantidade: 2 }];
  for (const ing of ings) {
    await AlchemyRecipeIngredient.create({ id_recipe: recipe.id, id_item: ing.item.id, quantidade: ing.quantidade });
  }
  return { recipe, itemReceita, itemResultado };
}

async function setNivelAlquimia(characterId, nivel) {
  // XP bem acima do necessário pro nível alvo — testes aqui não
  // precisam de precisão de curva, só "está nesse nível ou acima".
  const experiencia = nivel <= 1 ? 0 : 999999;
  await CharacterAlchemyProgress.destroy({ where: { id_personagem: characterId } });
  await CharacterAlchemyProgress.create({ id_personagem: characterId, nivel, experiencia, total_produzido: 0 });
}

// ---------------------------------------------------------------------
// Aprender receita física
// ---------------------------------------------------------------------

testeComBanco("aprender consome o pergaminho (consome_ao_aprender=true) e registra o unlock permanente", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta();
  await darItem(personagem.id, itemReceita.id, 1);

  const resultado = await alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id);
  assert.equal(resultado.aprendida, true);
  assert.equal(resultado.consumiu_item, true);

  assert.equal(await estoqueDe(personagem.id, itemReceita.id), 0, "pergaminho devia ter sido consumido");
  const conhece = await alchemyRecipeUnlockService.possuiDesbloqueio(personagem.id, recipe.id);
  assert.equal(conhece, true, "unlock devia ter sido gravado");
});

testeComBanco("consome_ao_aprender=false mantém o pergaminho no inventário após aprender", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta({ consomeAoAprender: false });
  await darItem(personagem.id, itemReceita.id, 2);

  const resultado = await alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id);
  assert.equal(resultado.consumiu_item, false);
  assert.equal(await estoqueDe(personagem.id, itemReceita.id), 2, "pergaminho não devia ter sido consumido");
});

testeComBanco("aprender sem possuir o pergaminho falha com mensagem clara", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta();
  await darItem(personagem.id, itemReceita.id, 0);

  await assert.rejects(
    () => alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id),
    /não possui essa fórmula física/i,
  );
});

testeComBanco("aprender abaixo do nível de Alquimia mínimo falha mesmo possuindo o item", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta({ nivelMinimo: 10 });
  await darItem(personagem.id, itemReceita.id, 1);
  await setNivelAlquimia(personagem.id, 1);

  await assert.rejects(
    () => alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id),
    /Requer nível 10 de Alquimia/,
  );
  assert.equal(await estoqueDe(personagem.id, itemReceita.id), 1, "não pode consumir o item numa tentativa rejeitada");
});

testeComBanco("aprender uma receita já conhecida falha (sem duplicar unlock nem reconsumir item)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta();
  await darItem(personagem.id, itemReceita.id, 2);

  await alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id);
  await darItem(personagem.id, itemReceita.id, 1); // simula achar outra cópia depois

  await assert.rejects(
    () => alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id),
    /já conhece essa receita/i,
  );
  assert.equal(await estoqueDe(personagem.id, itemReceita.id), 1, "segunda tentativa rejeitada não pode consumir a cópia nova");

  const unlocks = await CharacterAlchemyRecipeUnlock.count({
    where: { id_personagem: personagem.id, id_recipe: recipe.id },
  });
  assert.equal(unlocks, 1, "nunca duplica o unlock");
});

testeComBanco("aprender uma receita NIVEL (sem fórmula física) é rejeitado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const itemResultado = await criarItemConsumivel();
  const recipe = await AlchemyRecipe.create({
    key: `NIVEL_${sufixo()}`,
    nome: `Receita Nível ${sufixo()}`,
    categoria: "POCAO",
    id_item_resultado: itemResultado.id,
    quantidade_resultado: 1,
    nivel_alquimia_minimo: 1,
    xp_alquimia: 10,
    modo_desbloqueio: "NIVEL",
  });
  receitasCriadas.push(recipe.id);
  const ingrediente = await criarItem();
  await AlchemyRecipeIngredient.create({ id_recipe: recipe.id, id_item: ingrediente.id, quantidade: 1 });

  await assert.rejects(
    () => alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id),
    /liberada por nível/i,
  );
});

// ---------------------------------------------------------------------
// Livro de Fórmulas — visibilidade (listarCatalogo)
// ---------------------------------------------------------------------

testeComBanco("DESCOBERTA ainda não conhecida oculta ingredientes/custo/resultado e mostra a pista pública", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta({ pistaPublica: "Dizem que um alquimista louco a escondeu nas Terras Devastadas." });
  await darItem(personagem.id, itemReceita.id, 1);

  const progresso = { experiencia: 0 };
  const catalogo = await alchemyRecipeService.listarCatalogo(personagem.id, progresso);
  const linha = catalogo.find((r) => r.id === recipe.id);

  assert.ok(linha, "receita devia aparecer na listagem mesmo bloqueada");
  assert.equal(linha.desbloqueada, false);
  assert.equal(linha.ingredientes.length, 0, "ingredientes devem ficar ocultos");
  assert.equal(linha.resultado, null, "resultado exato deve ficar oculto");
  assert.equal(linha.custo_ouro, null);
  assert.equal(linha.xp_alquimia, null);
  assert.equal(linha.pista_publica, "Dizem que um alquimista louco a escondeu nas Terras Devastadas.");
  assert.ok(linha.formula_fisica, "formula_fisica devia vir preenchida (item cadastrado)");
  assert.equal(linha.formula_fisica.quantidade_possuida, 1);
  assert.equal(linha.formula_fisica.pode_aprender, true, "possui item + nível suficiente => pode aprender");
});

testeComBanco("depois de aprendida, a receita DESCOBERTA mostra dados completos igual uma NIVEL", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta();
  await darItem(personagem.id, itemReceita.id, 1);
  await alchemyLearnService.aprenderReceitaFisica(personagem.id, recipe.id);

  const progresso = { experiencia: 0 };
  const catalogo = await alchemyRecipeService.listarCatalogo(personagem.id, progresso);
  const linha = catalogo.find((r) => r.id === recipe.id);

  assert.equal(linha.desbloqueada, true);
  assert.notEqual(linha.resultado, null);
  assert.equal(linha.ingredientes.length, 1);
  assert.equal(linha.formula_fisica.pode_aprender, false, "já conhecida não pode 'aprender' de novo");
});

testeComBanco("sem possuir o pergaminho, pode_aprender fica false mesmo com nível suficiente", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { recipe, itemReceita } = await criarReceitaDescoberta();
  await darItem(personagem.id, itemReceita.id, 0);

  const progresso = { experiencia: 0 };
  const catalogo = await alchemyRecipeService.listarCatalogo(personagem.id, progresso);
  const linha = catalogo.find((r) => r.id === recipe.id);

  assert.equal(linha.formula_fisica.quantidade_possuida, 0);
  assert.equal(linha.formula_fisica.pode_aprender, false);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
