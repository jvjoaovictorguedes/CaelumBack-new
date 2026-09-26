// Painel Administrativo — "Mercado P2P": moderar anúncios ativos e
// consultar histórico de vendas (adminMarketService). Cancelamento
// reaproveita addStack/equipmentInstanceService.releaseFromMarket —
// mesmo fluxo de marketController.cancelarAnuncio, só sem checagem de
// dono e com motivo obrigatório.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const User = require("../src/models/User");
const MarketListing = require("../src/models/MarketListing");
const MarketTransaction = require("../src/models/MarketTransaction");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const adminMarketService = require("../src/services/adminMarketService");

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
const personagensCriados = [];
const usuariosCriados = [];
const listingsCriadas = [];
const transacoesCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (transacoesCriadas.length > 0) await MarketTransaction.destroy({ where: { id: transacoesCriadas } });
  if (listingsCriadas.length > 0) await MarketListing.destroy({ where: { id: listingsCriadas } });
  if (personagensCriados.length > 0) {
    await CharacterEquipmentInstance.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterInventory.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 3 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return { usuario, personagem };
}

async function criarItemMaterial(nome = "Item de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste do admin de Mercado.",
    tipo_item: "Material",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  return item;
}

async function criarItemEquipavel(nome = "Espada de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item equipável de teste.",
    tipo_item: "Arma",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("mercado admin: listAdminMarketListings filtra por status e vendedor", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const item = await criarItemMaterial();

  const ativo = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    quantidade_total: 5,
    quantidade_restante: 5,
    preco_unitario: 10,
    status: "Ativo",
  });
  const cancelado = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    quantidade_total: 3,
    quantidade_restante: 0,
    preco_unitario: 10,
    status: "Cancelado",
    cancelado_em: new Date(),
  });
  listingsCriadas.push(ativo.id, cancelado.id);

  const resultado = await adminMarketService.listAdminMarketListings({ vendedorId: vendedor.id, status: "Ativo" });
  assert.equal(resultado.total, 1);
  assert.equal(resultado.itens[0].id, ativo.id);
  assert.equal(resultado.itens[0].item.nome, item.nome);
  assert.equal(resultado.itens[0].vendedor.nome, vendedor.nome);
});

testeComBanco("mercado admin: cancelAdminMarketListing exige motivo e rejeita anúncio não-ativo", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const item = await criarItemMaterial();
  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    quantidade_total: 5,
    quantidade_restante: 5,
    preco_unitario: 10,
    status: "Ativo",
  });
  listingsCriadas.push(listing.id);

  await assert.rejects(
    () => adminMarketService.cancelAdminMarketListing(listing.id, { idAdmin: 1 }),
    /motivo é obrigatório/i,
  );

  await assert.rejects(
    () => adminMarketService.cancelAdminMarketListing(999999999, { idAdmin: 1, motivo: "x" }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("mercado admin: cancelAdminMarketListing (stack) devolve quantidade_restante ao vendedor via addStack", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const item = await criarItemMaterial();
  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    quantidade_total: 10,
    quantidade_restante: 7,
    preco_unitario: 10,
    status: "Ativo",
  });
  listingsCriadas.push(listing.id);

  const antesInventario = await CharacterInventory.findOne({ where: { id_personagem: vendedor.id, id_item: item.id } });
  assert.equal(antesInventario, null);

  const cancelado = await adminMarketService.cancelAdminMarketListing(listing.id, { idAdmin: 1, motivo: "moderação de teste" });
  assert.equal(cancelado.status, "Cancelado");
  assert.ok(cancelado.cancelado_em);

  const depoisInventario = await CharacterInventory.findOne({ where: { id_personagem: vendedor.id, id_item: item.id } });
  assert.equal(depoisInventario.quantidade, 7);
});

testeComBanco("mercado admin: cancelAdminMarketListing (equipamento) libera a instância de volta pro Inventário", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const itemArma = await criarItemEquipavel();
  const instancia = await sequelize.transaction((t) =>
    equipmentInstanceService.create({ idPersonagem: vendedor.id, idItem: itemArma.id, raridade: "Comum" }, t),
  );
  instancia.estado = "Mercado";
  await instancia.save();

  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: itemArma.id,
    id_instancia: instancia.id,
    quantidade_total: 1,
    quantidade_restante: 1,
    preco_unitario: 500,
    status: "Ativo",
  });
  listingsCriadas.push(listing.id);

  await adminMarketService.cancelAdminMarketListing(listing.id, { idAdmin: 1, motivo: "moderação de teste" });

  const instanciaAtualizada = await CharacterEquipmentInstance.findByPk(instancia.id);
  assert.equal(instanciaAtualizada.estado, "Inventario");
});

testeComBanco("mercado admin: cancelAdminMarketListing rejeita anúncio já Vendido", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const item = await criarItemMaterial();
  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    quantidade_total: 5,
    quantidade_restante: 0,
    preco_unitario: 10,
    status: "Vendido",
    vendido_em: new Date(),
  });
  listingsCriadas.push(listing.id);

  await assert.rejects(
    () => adminMarketService.cancelAdminMarketListing(listing.id, { idAdmin: 1, motivo: "x" }),
    /não está mais ativo/i,
  );
});

testeComBanco("mercado admin: listAdminMarketTransactions filtra por item/vendedor/comprador", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const { personagem: comprador } = await novoPersonagem();
  const item = await criarItemMaterial();

  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_personagem_comprador: comprador.id,
    id_item: item.id,
    quantidade_total: 3,
    quantidade_restante: 0,
    preco_unitario: 10,
    status: "Vendido",
    vendido_em: new Date(),
  });
  listingsCriadas.push(listing.id);

  const transacao = await MarketTransaction.create({
    id_listing: listing.id,
    id_personagem_vendedor: vendedor.id,
    id_personagem_comprador: comprador.id,
    id_item: item.id,
    quantidade: 3,
    preco_unitario: 10,
    preco_total: 30,
    taxa: 3,
    valor_liquido_vendedor: 27,
  });
  transacoesCriadas.push(transacao.id);

  const porVendedor = await adminMarketService.listAdminMarketTransactions({ vendedorId: vendedor.id });
  assert.equal(porVendedor.total, 1);
  assert.equal(porVendedor.itens[0].comprador.nome, comprador.nome);

  const porComprador = await adminMarketService.listAdminMarketTransactions({ compradorId: comprador.id });
  assert.equal(porComprador.total, 1);
});
