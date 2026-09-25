// Painel Administrativo — "Loja NPC" (Economia) reaproveita
// listAdminItems/updateAdminItem já existentes (nenhum endpoint novo,
// só o filtro disponivelLoja) em vez de duplicar CRUD de Item numa
// tela própria — ver AdminShopClient.tsx.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const adminItemService = require("../src/services/adminItemService");

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

testeComBanco("listAdminItems: filtro disponivelLoja isola itens na loja dos demais", async () => {
  const marca = sufixo();
  const naLoja = await Item.create({
    nome: `Na Loja ${marca}`,
    descricao: "d",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    disponivel_loja: true,
  });
  const foraDaLoja = await Item.create({
    nome: `Fora da Loja ${marca}`,
    descricao: "d",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 10,
    valor_venda: 5,
    disponivel_loja: false,
  });
  itensCriados.push(naLoja.id, foraDaLoja.id);

  const comFiltro = await adminItemService.listAdminItems({ nome: marca, disponivelLoja: true });
  assert.equal(comFiltro.total, 1);
  assert.equal(comFiltro.itens[0].id, naLoja.id);

  const semFiltro = await adminItemService.listAdminItems({ nome: marca });
  assert.equal(semFiltro.total, 2);
});

testeComBanco("updateAdminItem: corrige valor_compra/valor_venda/disponivel_loja", async () => {
  const item = await Item.create({
    nome: `Item Preço ${sufixo()}`,
    descricao: "d",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 100,
    valor_venda: 40,
    disponivel_loja: false,
  });
  itensCriados.push(item.id);

  const atualizado = await adminItemService.updateAdminItem(
    item.id,
    { nome: item.nome, descricao: item.descricao, tipo_item: item.tipo_item, raridade: item.raridade, valor_compra: 150, valor_venda: 60, disponivel_loja: true },
    { idAdmin: 1 },
  );

  assert.equal(atualizado.valor_compra, 150);
  assert.equal(atualizado.valor_venda, 60);
  assert.equal(atualizado.disponivel_loja, true);
});
