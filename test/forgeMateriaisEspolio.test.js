// Forja-Materiais — 4ª fonte de ingrediente lógico (pedido: "na criação
// de novos equipamentos ou poções, é possível utilizar espólios
// também"). Espolio segue o MESMO padrão de ProdutoAlquimia (ver
// test/forgeMateriaisAlquimia.test.js): sem variante de qualidade, mas
// aqui id_recurso é o próprio Item.id do Espólio (sem catálogo
// intermediário). Cobertura: resolução (forgeMaterialsService),
// validação admin (TIPOS_INSUMO_VALIDOS/matriz), listagem admin de
// espólios elegíveis e fabricação real via
// forgeCraftingService.iniciarFabricacao.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
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
    username: `admin_forja_esp_${chave}`,
    email: `admin_forja_esp_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

// Espólio mínimo (Item tipo_item="Espolio") — sem catálogo de recurso
// intermediário nem variante de qualidade: o próprio Item.id é
// id_recurso do ingrediente (ver forgeMaterialsService.js).
async function criarItemEspolio({ ativo = true } = {}) {
  const item = await Item.create({
    nome: `Espolio Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Espolio",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
    ativo,
  });
  itensCriados.push(item.id);
  return item;
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
const itensCriados = [];

test.after(async () => {
  if (!temBanco) return;
  await ForgeBlueprintIngredient.destroy({ where: { id_blueprint: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await ForgeBlueprint.destroy({ where: { id: blueprintsCriados.length ? blueprintsCriados : [-1] } });
  await sequelize.close();
});

// -----------------------------------------------------------------
// forgeMaterialsService: resolução do insumo polimórfico
// -----------------------------------------------------------------

testeComBanco("resolverIdItemDoInsumo(Espolio): resolve o próprio Item, mesmo Item nas 6 qualidades", async () => {
  const espolio = await criarItemEspolio();

  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const idItem = await resolverIdItemDoInsumo({ tipo_insumo: "Espolio", id_recurso: espolio.id, qualidade });
    assert.equal(idItem, espolio.id, `qualidade ${qualidade} devia resolver pro próprio Espólio`);
  }
});

testeComBanco("resolverIdItemDoInsumo(Espolio): Item inexistente devolve null (nunca lança)", async () => {
  const idItem = await resolverIdItemDoInsumo({ tipo_insumo: "Espolio", id_recurso: -999, qualidade: "Comum" });
  assert.equal(idItem, null);
});

testeComBanco("resolverIdItemDoInsumo(Espolio): Item desativado devolve null (nunca resolve pra material descontinuado)", async () => {
  const espolio = await criarItemEspolio({ ativo: false });
  const idItem = await resolverIdItemDoInsumo({ tipo_insumo: "Espolio", id_recurso: espolio.id, qualidade: "Comum" });
  assert.equal(idItem, null);
});

testeComBanco("resolverIdItemDoInsumo(Espolio): Item de outro tipo_item (ex.: Material) nunca resolve como Espólio", async () => {
  const item = await Item.create({
    nome: `Material Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  itensCriados.push(item.id);
  const idItem = await resolverIdItemDoInsumo({ tipo_insumo: "Espolio", id_recurso: item.id, qualidade: "Comum" });
  assert.equal(idItem, null, "um Item que não é tipo_item Espolio nunca deve resolver por esse tipo_insumo");
});

testeComBanco("resolverNomeRecursoDoInsumo: Espolio usa Item.nome direto", async () => {
  const espolio = await criarItemEspolio();
  const nome = await resolverNomeRecursoDoInsumo({ tipo_insumo: "Espolio", id_recurso: espolio.id });
  assert.equal(nome, espolio.nome);
});

// -----------------------------------------------------------------
// adminForgeService: listagem de espólios elegíveis + validação
// -----------------------------------------------------------------

testeComBanco("listarEspoliosParaForjaAdmin: só devolve Itens ATIVOS de tipo_item Espolio", async () => {
  const espolioAtivo = await criarItemEspolio();
  const espolioInativo = await criarItemEspolio({ ativo: false });
  const material = await Item.create({
    nome: `Material Fora ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  itensCriados.push(material.id);

  const espolios = await adminForgeService.listarEspoliosParaForjaAdmin();
  assert.ok(espolios.some((e) => e.id === espolioAtivo.id), "espólio ativo precisa aparecer na listagem");
  assert.ok(!espolios.some((e) => e.id === espolioInativo.id), "espólio desativado não pode aparecer");
  assert.ok(!espolios.some((e) => e.id === material.id), "Item que não é Espólio não pode aparecer");
});

testeComBanco("forgeAdminValidationService: Espolio é um tipo_insumo válido", () => {
  assert.ok(forgeAdminValidationService.TIPOS_INSUMO_VALIDOS.includes("Espolio"));
  assert.doesNotThrow(() =>
    forgeAdminValidationService.validarIngredientesPayload([{ tipo_insumo: "Espolio", id_recurso: 1, quantidade_base: 1 }]),
  );
});

testeComBanco("resolverMatrizIngredientes: ingrediente Espolio resolve OK nas 6 qualidades", async () => {
  const espolio = await criarItemEspolio();
  const matriz = await forgeAdminValidationService.resolverMatrizIngredientes([
    { tipo_insumo: "Espolio", id_recurso: espolio.id, quantidade_base: 2 },
  ]);
  assert.equal(matriz.length, 1);
  for (const qualidade of forgeConfig.ORDEM_QUALIDADE) {
    const resolucao = matriz[0].resolucao[qualidade];
    assert.equal(resolucao.status, "OK", `qualidade ${qualidade} devia resolver`);
    assert.equal(resolucao.id_item, espolio.id);
  }
  assert.ok(forgeAdminValidationService.todosIngredientesResolviveis(matriz));
});

// -----------------------------------------------------------------
// Blueprint completo com ingrediente Espolio: criar, validar, ativar e
// fabricar de verdade (ponta a ponta).
// -----------------------------------------------------------------

testeComBanco("Blueprint com ingrediente Espolio: cria, ativa e fabrica consumindo o próprio Espólio do inventário", async () => {
  const admin = await criarUsuarioAdmin();
  const { personagem } = await criarPersonagem();
  const espolio = await criarItemEspolio();

  const blueprint = await adminForgeService.criarBlueprintAdmin(
    {
      nome: `Vara com Espolio ${sufixo()}`,
      categoria_equipamento: "Ferramenta",
      tier_equipamento: 1,
      multiplicador_tempo: 1,
      nivel_forja_minimo: 1,
      ingredientes: [{ tipo_insumo: "Espolio", id_recurso: espolio.id, quantidade_base: 3 }],
    },
    { idAdmin: admin.id },
  );
  blueprintsCriados.push(blueprint.id);

  const itemVara = await criarItemVaraFerramenta("Comum");
  await adminForgeService.atualizarBlueprintAdmin(blueprint.id, { id_item_resultado: itemVara.id }, { idAdmin: admin.id });

  const relatorio = await adminForgeService.validarBlueprintAdmin(blueprint.id);
  assert.equal(relatorio.podeAtivar, true, `esperava poder ativar: ${JSON.stringify(relatorio.motivos)}`);
  const linhaIngrediente = relatorio.matrizIngredientes[0];
  assert.equal(linhaIngrediente.resolucao.Comum.id_item, espolio.id);

  await adminForgeService.setAtivoBlueprintAdmin(blueprint.id, true, { idAdmin: admin.id });

  // Sem espólio no inventário ainda — fabricação precisa recusar.
  await assert.rejects(
    () => forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" }),
    /Falta material/,
  );

  await CharacterInventory.create({ id_personagem: personagem.id, id_item: espolio.id, quantidade: 5 });

  const resultado = await forgeCraftingService.iniciarFabricacao(personagem.id, { id_blueprint: blueprint.id, qualidade: "Comum" });
  assert.ok(resultado.pronto_em);

  const entradaInventario = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: espolio.id } });
  assert.equal(entradaInventario.quantidade, 2, "quantidade_base=3 consumida de um estoque de 5");

  const naFila = await CharacterForgeQueue.findOne({ where: { id_personagem: personagem.id, slot: "Forja" } });
  assert.ok(naFila, "fabricação precisa entrar na fila da Forja");
  assert.equal(naFila.referencia.id_blueprint, blueprint.id);
  assert.equal(naFila.payload_resultado.id_item, itemVara.id);

  await naFila.destroy();
});
