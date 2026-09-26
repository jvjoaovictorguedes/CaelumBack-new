// Forja-Materiais — "Forja pode usar materiais da Silvicultura,
// Exploração e Caldeirão como ingredientes". Silvicultura/Exploração já
// eram suportadas (RecursoExpedicao usa a MESMA ExpeditionResource de
// Mineração, só profissão diferente); esta cobertura é do tipo NOVO,
// ProdutoAlquimia — resolução (forgeMaterialsService), validação admin
// (TIPOS_INSUMO_VALIDOS/matriz), listagem admin de produtos elegíveis,
// preview admin (regressão: nome_recurso não pode mais ler
// ingrediente.recurso?.nome, removido junto com a associação) e
// fabricação real via forgeCraftingService.iniciarFabricacao.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const ExpeditionResource = require("../src/models/ExpeditionResource");
const AlchemyRecipe = require("../src/models/AlchemyRecipe");
const ForgeBlueprint = require("../src/models/ForgeBlueprint");
const ForgeBlueprintIngredient = require("../src/models/ForgeBlueprintIngredient");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterForgeQueue = require("../src/models/CharacterForgeQueue");
const FishingRodProperties = require("../src/models/FishingRodProperties");

const forgeConfig = require("../src/config/forgeConfig");
const { resolverIdItemDoInsumo, resolverNomeRecursoDoInsumo } = require("../src/services/forgeMaterialsService");
const forgeCraftingService = require("../src/services/forgeCraftingService");
const adminForgeService = require("../src/services/adminForgeService");
const forgeAdminValidationService = require("../src/services/forgeAdminValidationService");

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

async function criarUsuarioAdmin() {
  const User = require("../src/models/User");
  const chave = sufixo();
  return User.create({
    username: `admin_forja_mat_${chave}`,
    email: `admin_forja_mat_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

// Produto do Caldeirão mínimo (Item Consumível + AlchemyRecipe apontando
// pra ele) — Alquimia não tem variante de qualidade (§3/§6.1 do domínio
// próprio), então um só Item já cobre as 6 qualidades da Forja.
async function criarProdutoAlquimiaCompleto() {
  const chave = sufixo();
  const itemResultado = await Item.create({
    nome: `Pocao Teste ${chave}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Consumivel",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  const receita = await AlchemyRecipe.create({
    key: `pocao_teste_${chave}`,
    nome: `Receita Teste ${chave}`,
    categoria: "POCAO",
    id_item_resultado: itemResultado.id,
  });
  receitasCriadas.push(receita.id);
  itensCriados.push(itemResultado.id);
  return { receita, itemResultado };
}

async function criarItemVaraFerramenta(qualidade) {
  const item = await Item.create({
    nome: `Vara Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Ferramenta",
    raridade: qualidade,
    tier_equipamento: 1,
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  await FishingRodProperties.create({ id_item: item.id });
  itensCriados.push(item.id);
  return item;
}

const blueprintsCriados = [];
const receitasCriadas = [];
const itensCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await ForgeBlueprintIngredient.destroy({ where: { id_blueprint: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await ForgeBlueprint.destroy({ where: { id: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await AlchemyRecipe.destroy({ where: { id: receitasCriadas.length ? receitasCriadas : [-1] } });
  await sequelize.close();
});

// -----------------------------------------------------------------
// forgeMaterialsService: resolução do insumo polimórfico (§núcleo)
// -----------------------------------------------------------------

testeComBanco("resolverIdItemDoInsumo(ProdutoAlquimia): resolve o Item de resultado da receita, mesmo Item nas 6 qualidades", async () => {
  const { receita, itemResultado } = await criarProdutoAlquimiaCompleto();

  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const idItem = await resolverIdItemDoInsumo({ tipo_insumo: "ProdutoAlquimia", id_recurso: receita.id, qualidade });
    assert.equal(idItem, itemResultado.id, `qualidade ${qualidade} devia resolver pro mesmo Item de resultado`);
  }
});

testeComBanco("resolverIdItemDoInsumo(ProdutoAlquimia): receita inexistente devolve null (nunca lança)", async () => {
  const idItem = await resolverIdItemDoInsumo({ tipo_insumo: "ProdutoAlquimia", id_recurso: -999, qualidade: "Comum" });
  assert.equal(idItem, null);
});

testeComBanco("resolverNomeRecursoDoInsumo: ProdutoAlquimia usa AlchemyRecipe.nome, nunca ExpeditionResource", async () => {
  const { receita } = await criarProdutoAlquimiaCompleto();
  const nome = await resolverNomeRecursoDoInsumo({ tipo_insumo: "ProdutoAlquimia", id_recurso: receita.id });
  assert.equal(nome, receita.nome);
});

testeComBanco("resolverNomeRecursoDoInsumo: Barra/RecursoExpedicao ainda usam ExpeditionResource.nome (sem regressão)", async () => {
  const recurso = await ExpeditionResource.create({ nome: `Recurso Teste ${sufixo()}`, profissao: "Silvicultura" });
  const nomeBarra = await resolverNomeRecursoDoInsumo({ tipo_insumo: "Barra", id_recurso: recurso.id });
  const nomeExpedicao = await resolverNomeRecursoDoInsumo({ tipo_insumo: "RecursoExpedicao", id_recurso: recurso.id });
  assert.equal(nomeBarra, recurso.nome);
  assert.equal(nomeExpedicao, recurso.nome);
});

// Regressão do bug real encontrado nesta mesma tarefa: id_recurso de uma
// receita de Alquimia pode coincidir por acaso com o id de um
// ExpeditionResource não relacionado — ler ingrediente.recurso?.nome (a
// association removida) mostraria o nome ERRADO. resolverNomeRecursoDoInsumo
// é a única fonte correta e nunca deve colidir os dois domínios.
testeComBanco("resolverNomeRecursoDoInsumo: id numericamente igual não confunde ProdutoAlquimia com ExpeditionResource", async () => {
  const { receita } = await criarProdutoAlquimiaCompleto();
  const recursoComMesmoId = await ExpeditionResource.findByPk(receita.id);
  if (recursoComMesmoId) {
    // Coincidência real de id entre as duas tabelas neste ambiente —
    // ainda assim o tipo_insumo decide a tabela certa.
    const nomeComoRecurso = await resolverNomeRecursoDoInsumo({ tipo_insumo: "RecursoExpedicao", id_recurso: receita.id });
    assert.notEqual(nomeComoRecurso, receita.nome, "mesmo id não deve devolver o nome da receita quando o tipo_insumo é RecursoExpedicao");
  }
  const nomeComoProduto = await resolverNomeRecursoDoInsumo({ tipo_insumo: "ProdutoAlquimia", id_recurso: receita.id });
  assert.equal(nomeComoProduto, receita.nome);
});

// -----------------------------------------------------------------
// adminForgeService: listagem de produtos elegíveis + validação
// -----------------------------------------------------------------

testeComBanco("listarProdutosAlquimiaAdmin: só devolve receitas ATIVAS, com o Item de resultado resolvido", async () => {
  const { receita, itemResultado } = await criarProdutoAlquimiaCompleto();
  const receitaInativa = await AlchemyRecipe.create({
    key: `pocao_inativa_${sufixo()}`,
    nome: `Receita Inativa ${sufixo()}`,
    categoria: "TONICO",
    id_item_resultado: itemResultado.id,
    ativo: false,
  });
  receitasCriadas.push(receitaInativa.id);

  const produtos = await adminForgeService.listarProdutosAlquimiaAdmin();
  const linha = produtos.find((p) => p.id === receita.id);
  assert.ok(linha, "receita ativa precisa aparecer na listagem");
  assert.equal(linha.item_resultado?.id, itemResultado.id);
  assert.ok(!produtos.some((p) => p.id === receitaInativa.id), "receita inativa não pode aparecer");
});

testeComBanco("forgeAdminValidationService: ProdutoAlquimia é um tipo_insumo válido", () => {
  assert.ok(forgeAdminValidationService.TIPOS_INSUMO_VALIDOS.includes("ProdutoAlquimia"));
  assert.doesNotThrow(() =>
    forgeAdminValidationService.validarIngredientesPayload([{ tipo_insumo: "ProdutoAlquimia", id_recurso: 1, quantidade_base: 1 }]),
  );
});

testeComBanco("resolverMatrizIngredientes: ingrediente ProdutoAlquimia resolve OK nas 6 qualidades", async () => {
  const { receita, itemResultado } = await criarProdutoAlquimiaCompleto();
  const matriz = await forgeAdminValidationService.resolverMatrizIngredientes([
    { tipo_insumo: "ProdutoAlquimia", id_recurso: receita.id, quantidade_base: 2 },
  ]);
  assert.equal(matriz.length, 1);
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const resolucao = matriz[0].resolucao[qualidade];
    assert.equal(resolucao.status, "OK", `qualidade ${qualidade} devia resolver`);
    assert.equal(resolucao.id_item, itemResultado.id);
  }
  assert.ok(forgeAdminValidationService.todosIngredientesResolviveis(matriz));
});

// -----------------------------------------------------------------
// Blueprint completo com ingrediente ProdutoAlquimia: criar, validar,
// ativar e fabricar de verdade (ponta a ponta).
// -----------------------------------------------------------------

testeComBanco("Blueprint com ingrediente ProdutoAlquimia: cria, ativa e fabrica consumindo o Item certo do inventário", async () => {
  const admin = await criarUsuarioAdmin();
  const { personagem } = await criarPersonagem();
  const { receita, itemResultado: itemIngrediente } = await criarProdutoAlquimiaCompleto();

  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Vara com Alquimia ${sufixo()}`,
      categoria_equipamento: "Ferramenta",
      tier_equipamento: 1,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ingredientes: [{ tipo_insumo: "ProdutoAlquimia", id_recurso: receita.id, quantidade_base: 3 }],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  const itemVara = await criarItemVaraFerramenta("Comum");
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { id_item_resultado: itemVara.id }, { idAdmin: admin.id });

  const relatorio = await adminForgeService.validarBlueprintAdmin(blueprint.id);
  assert.equal(relatorio.podeAtivar, true, `esperava poder ativar: ${JSON.stringify(relatorio.motivos)}`);
  const linhaIngrediente = relatorio.matrizIngredientes[0];
  assert.equal(linhaIngrediente.resolucao.Comum.id_item, itemIngrediente.id);

  await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });

  // Sem material no inventário ainda — fabricação precisa recusar.
  await assert.rejects(
    () => forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" }),
    /Falta material/,
  );

  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemIngrediente.id, quantidade: 5 });

  const resultado = await forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" });
  assert.ok(resultado.pronto_em);

  const entradaInventario = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemIngrediente.id } });
  assert.equal(entradaInventario.quantidade, 2, "quantidade_base=3 consumida de um estoque de 5");

  const naFila = await CharacterForgeQueue.findOne({ where: { id_personagem: personagem.id, slot: "Forja" } });
  assert.ok(naFila, "fabricação precisa entrar na fila da Forja");
  assert.equal(naFila.referencia.id_blueprint, blueprint.id);
  assert.equal(naFila.payload_resultado.id_item, itemVara.id);

  await naFila.destroy();
});

// Regressão do bug encontrado nesta tarefa: previewBlueprintAdmin lia
// ingrediente.recurso?.nome (association removida junto com o FK de
// id_recurso) — sem correção, nome_recurso vinha sempre undefined pra
// TODOS os blueprints, não só os de ProdutoAlquimia.
testeComBanco("previewBlueprintAdmin: nome_recurso vem preenchido pro ingrediente (Barra e ProdutoAlquimia)", async () => {
  const admin = await criarUsuarioAdmin();
  const recurso = await ExpeditionResource.create({ nome: `Minerio Preview ${sufixo()}`, profissao: "Mineracao" });
  const ForgeBarItem = require("../src/models/ForgeBarItem");
  const itemBarra = await Item.create({
    nome: `Barra Preview ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  itensCriados.push(itemBarra.id);
  await ForgeBarItem.create({ id_recurso: recurso.id, qualidade: "Comum", id_item: itemBarra.id });

  const { receita } = await criarProdutoAlquimiaCompleto();

  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Preview Nome Recurso ${sufixo()}`,
      categoria_equipamento: "Arma",
      tier_equipamento: 1,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ingredientes: [
        { tipo_insumo: "Barra", id_recurso: recurso.id, quantidade_base: 1 },
        { tipo_insumo: "ProdutoAlquimia", id_recurso: receita.id, quantidade_base: 1 },
      ],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  const preview = await adminForgeService.previewBlueprintAdmin(blueprint.id, { nivelForja: 1, qualidadeBase: "Comum" });
  const ingredienteBarra = preview.ingredientes.find((i) => i.tipo_insumo === "Barra");
  const ingredienteAlquimia = preview.ingredientes.find((i) => i.tipo_insumo === "ProdutoAlquimia");
  assert.equal(ingredienteBarra.nome_recurso, recurso.nome, "nome_recurso da Barra não pode vir undefined");
  assert.equal(ingredienteAlquimia.nome_recurso, receita.nome, "nome_recurso do ProdutoAlquimia precisa ser o nome da receita");
});
