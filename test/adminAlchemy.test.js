// Painel Administrativo — Alquimia (Caldeirão). Cobre CRUD de receitas via
// adminAlchemyService, seguindo os mesmos helpers de fixture de
// test/adminFishing.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const AlchemyRecipe = require("../src/models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../src/models/AlchemyRecipeIngredient");
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
const receitasCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  await AlchemyRecipeIngredient.destroy({ where: { id_recipe: receitasCriadas.length ? receitasCriadas : [-1] } });
  await AlchemyRecipe.destroy({ where: { id: receitasCriadas.length ? receitasCriadas : [-1] } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  if (temBanco) await sequelize.close();
});

async function criarItemConsumivel(nome = "Poção de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste do admin de Alquimia.",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

async function criarItemMaterial(nome = "Ingrediente de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Ingrediente de teste do admin de Alquimia.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("admin alchemy receitas: create exige item resultado do tipo Consumível", async () => {
  const itemNaoConsumivel = await criarItemMaterial();

  await assert.rejects(
    () =>
      adminAlchemyService.createAdminAlchemyRecipe(
        {
          key: `receita_${sufixo()}`,
          nome: "Receita Inválida",
          categoria: "POCAO",
          id_item_resultado: itemNaoConsumivel.id,
          ingredientes: [],
        },
        { idAdmin: 1, req: {} },
      ),
    /Consumível/i,
  );

  await assert.rejects(
    () =>
      adminAlchemyService.createAdminAlchemyRecipe(
        { key: `receita_${sufixo()}`, nome: "Receita Sem Item", categoria: "POCAO", id_item_resultado: 999999999, ingredientes: [] },
        { idAdmin: 1, req: {} },
      ),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("admin alchemy receitas: create com ingredientes e resolução de item (batch, sem include/alias)", async () => {
  const itemResultado = await criarItemConsumivel();
  const ingrediente1 = await criarItemMaterial("Erva de Teste");
  const ingrediente2 = await criarItemMaterial("Raiz de Teste");

  const receita = await adminAlchemyService.createAdminAlchemyRecipe(
    {
      key: `receita_${sufixo()}`,
      nome: "Poção de Cura de Teste",
      categoria: "POCAO",
      id_item_resultado: itemResultado.id,
      quantidade_resultado: 1,
      nivel_alquimia_minimo: 1,
      xp_alquimia: 10,
      custo_ouro: 5,
      modo_desbloqueio: "NIVEL",
      ativo: true,
      ordem: 1,
      ingredientes: [
        { id_item: ingrediente1.id, quantidade: 2 },
        { id_item: ingrediente2.id, quantidade: 1 },
      ],
    },
    { idAdmin: 1, req: {} },
  );
  receitasCriadas.push(receita.id);

  assert.equal(receita.item_resultado.id, itemResultado.id);
  assert.equal(receita.ingredientes.length, 2);
  assert.ok(receita.ingredientes.every((i) => i.item), "cada ingrediente deveria vir com o item resolvido");
});

testeComBanco("admin alchemy receitas: update troca item resultado/ingredientes e valida novo item (regressão do lock+outer join)", async () => {
  const itemResultado1 = await criarItemConsumivel();
  const itemResultado2 = await criarItemConsumivel();
  const itemNaoConsumivel = await criarItemMaterial();
  const ingredienteInicial = await criarItemMaterial();
  const ingredienteNovo = await criarItemMaterial();

  const receita = await adminAlchemyService.createAdminAlchemyRecipe(
    {
      key: `receita_${sufixo()}`,
      nome: "Receita Original",
      categoria: "TONICO",
      id_item_resultado: itemResultado1.id,
      modo_desbloqueio: "NIVEL",
      ingredientes: [{ id_item: ingredienteInicial.id, quantidade: 1 }],
    },
    { idAdmin: 1, req: {} },
  );
  receitasCriadas.push(receita.id);

  // Este update exercita o findByPk com lock: transaction.LOCK.UPDATE —
  // combinar isso com o include de "ingredientes" (hasMany -> LEFT OUTER
  // JOIN) faz o Postgres rejeitar com "FOR UPDATE cannot be applied to
  // the nullable side of an outer join". Regressão coberta aqui.
  const atualizada = await adminAlchemyService.updateAdminAlchemyRecipe(
    receita.id,
    {
      nome: "Receita Atualizada",
      id_item_resultado: itemResultado2.id,
      ingredientes: [{ id_item: ingredienteNovo.id, quantidade: 3 }],
    },
    { idAdmin: 1, req: {} },
  );

  assert.equal(atualizada.nome, "Receita Atualizada");
  assert.equal(atualizada.item_resultado.id, itemResultado2.id);
  assert.equal(atualizada.ingredientes.length, 1);
  assert.equal(atualizada.ingredientes[0].id_item, ingredienteNovo.id);
  assert.equal(atualizada.ingredientes[0].quantidade, 3);

  await assert.rejects(
    () =>
      adminAlchemyService.updateAdminAlchemyRecipe(
        receita.id,
        { id_item_resultado: itemNaoConsumivel.id },
        { idAdmin: 1, req: {} },
      ),
    /Consumível/i,
  );

  await assert.rejects(
    () => adminAlchemyService.updateAdminAlchemyRecipe(999999999, { nome: "X" }, { idAdmin: 1, req: {} }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("admin alchemy receitas: listagem inclui ingredientes e item resolvido", async () => {
  const itemResultado = await criarItemConsumivel();
  const receita = await adminAlchemyService.createAdminAlchemyRecipe(
    {
      key: `receita_${sufixo()}`,
      nome: "Receita Listagem",
      categoria: "ELIXIR",
      id_item_resultado: itemResultado.id,
      modo_desbloqueio: "DESCOBERTA",
      ingredientes: [],
    },
    { idAdmin: 1, req: {} },
  );
  receitasCriadas.push(receita.id);

  const lista = await adminAlchemyService.listAdminAlchemyRecipes();
  const encontrada = lista.find((r) => r.id === receita.id);
  assert.ok(encontrada, "receita recém-criada deveria aparecer na listagem");
  assert.equal(encontrada.item_resultado.id, itemResultado.id);
  assert.deepEqual(encontrada.ingredientes, []);
});
