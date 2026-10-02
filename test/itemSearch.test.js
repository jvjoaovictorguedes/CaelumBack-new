// Melhoria Mercado Negro (Loja do Aventureiro) — pedido do jogador:
// "nenhum jogador sabe id do produto". itemService.buscarItensNegociaveis
// alimenta o seletor de item do frontend (Publicar demanda / Nova
// encomenda), então precisa aplicar a MESMA filtragem de elegibilidade
// que os services que CRIAM esses registros (playerShopDemandService/
// playerShopCommissionService/marketService) — nunca deixar escolher
// aqui algo que o backend ia rejeitar na hora de publicar.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const itemService = require("../src/services/itemService");

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
test.afterEach(async () => {
  if (!temBanco) return;
  if (itensCriados.length > 0) {
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

async function criarItem(overrides = {}) {
  const item = await Item.create({
    nome: `Item Busca ${sufixo()}`,
    descricao: "Item de teste.",
    tipo_item: "Material",
    raridade: "Comum",
    ativo: true,
    negociavel_mercado: true,
    ...overrides,
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("busca por nome (case-insensitive, substring)", async () => {
  const chave = sufixo();
  const alvo = await criarItem({ nome: `Espada da Aurora ${chave}` });
  await criarItem({ nome: `Machado Antigo ${chave}` });

  const resultado = await itemService.buscarItensNegociaveis({ busca: `espada da aurora ${chave}` });
  assert.ok(resultado.some((i) => i.id === alvo.id));
  assert.ok(!resultado.some((i) => i.nome.startsWith("Machado")));
});

testeComBanco("nunca devolve item inativo", async () => {
  const chave = sufixo();
  const inativo = await criarItem({ nome: `Item Inativo ${chave}`, ativo: false });

  const resultado = await itemService.buscarItensNegociaveis({ busca: chave });
  assert.ok(!resultado.some((i) => i.id === inativo.id));
});

testeComBanco("nunca devolve item não negociável no mercado", async () => {
  const chave = sufixo();
  const naoNegociavel = await criarItem({ nome: `Item Preso ${chave}`, negociavel_mercado: false });

  const resultado = await itemService.buscarItensNegociaveis({ busca: chave });
  assert.ok(!resultado.some((i) => i.id === naoNegociavel.id));
});

testeComBanco("nunca devolve QuestItem nem Currencia, mesmo ativo e negociável", async () => {
  const chave = sufixo();
  const questItem = await criarItem({ nome: `Chave da Masmorra ${chave}`, tipo_item: "QuestItem" });
  const moeda = await criarItem({ nome: `Ficha Especial ${chave}`, tipo_item: "Currencia" });

  const resultado = await itemService.buscarItensNegociaveis({ busca: chave });
  assert.ok(!resultado.some((i) => i.id === questItem.id));
  assert.ok(!resultado.some((i) => i.id === moeda.id));
});

testeComBanco("apenasEstocaveis exclui equipamento (Demanda não aceita, só Encomenda)", async () => {
  const chave = sufixo();
  const arma = await criarItem({ nome: `Espada Encomendável ${chave}`, tipo_item: "Arma" });
  const material = await criarItem({ nome: `Minério Comum ${chave}`, tipo_item: "Material" });

  const semFiltro = await itemService.buscarItensNegociaveis({ busca: chave });
  assert.ok(semFiltro.some((i) => i.id === arma.id), "sem filtro, equipamento aparece (Encomenda aceita)");
  assert.ok(semFiltro.some((i) => i.id === material.id));

  const comFiltro = await itemService.buscarItensNegociaveis({ busca: chave, apenasEstocaveis: true });
  assert.ok(!comFiltro.some((i) => i.id === arma.id), "com apenasEstocaveis, equipamento some (vale pra Demanda)");
  assert.ok(comFiltro.some((i) => i.id === material.id));
});
