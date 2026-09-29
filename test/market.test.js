// Mercado Negro (P2P) — listarAnuncios (marketController.js). Bug real
// reportado: a tela de listagem mostrava a descrição do item ao passar
// o mouse, mas nunca os atributos (dano/defesa/bônus) — o include do
// Item nesta rota nunca trazia weaponProperties/armorProperties/
// consumableProperties/fishingRodProperties (só o include ANINHADO em
// instancia.item tinha isso, e nada lê esse caminho — nem
// comEfetivoNaInstancia nem o frontend). meusAnuncios já usava o
// include certo (INCLUDE_ITEM_COM_PROPRIEDADES) — só listarAnuncios
// (a rota que o comprador realmente vê) estava com o include pela
// metade.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const User = require("../src/models/User");
const WeaponProperties = require("../src/models/WeaponProperties");
const ConsumableProperties = require("../src/models/ConsumableProperties");
const MarketListing = require("../src/models/MarketListing");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const marketController = require("../src/controllers/marketController");

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

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const itensCriados = [];
const personagensCriados = [];
const usuariosCriados = [];
const listingsCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (listingsCriadas.length > 0) await MarketListing.destroy({ where: { id: listingsCriadas } });
  if (personagensCriados.length > 0) {
    await CharacterEquipmentInstance.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterInventory.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  if (itensCriados.length > 0) {
    await WeaponProperties.destroy({ where: { id_item: itensCriados } });
    await ConsumableProperties.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
  }
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 3 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return { usuario, personagem };
}

testeComBanco("mercado: listarAnuncios devolve os atributos da arma (dano/bônus), não só a descrição", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const item = await Item.create({
    nome: `Espada de Teste ${sufixo()}`,
    descricao: "Uma lâmina afiada.",
    tipo_item: "Arma",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  await WeaponProperties.create({
    id_item: item.id,
    dano_min: 10,
    dano_max: 20,
    tipo_dano: "Fisico",
    tipo_arma: "Espada",
    bonus_atributo: "Forca",
    valor_bonus_atributo: 5,
  });

  const instancia = await sequelize.transaction((t) =>
    equipmentInstanceService.create({ idPersonagem: vendedor.id, idItem: item.id, raridade: "Comum" }, t),
  );
  instancia.estado = "Mercado";
  await instancia.save();

  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    id_instancia: instancia.id,
    quantidade_total: 1,
    quantidade_restante: 1,
    preco_unitario: 500,
    status: "Ativo",
  });
  listingsCriadas.push(listing.id);

  const req = { query: {} };
  const res = fakeRes();
  await marketController.listarAnuncios(req, res);

  assert.equal(res.statusCode, 200);
  const encontrado = res.body.data.listings.find((l) => l.id === listing.id);
  assert.ok(encontrado, "o anúncio criado precisa aparecer na listagem");
  assert.ok(encontrado.item.weaponProperties, "item.weaponProperties precisa vir preenchido — é o que a tela usa pra mostrar atributos");
  assert.equal(encontrado.item.weaponProperties.dano_min, 10);
  assert.equal(encontrado.item.weaponProperties.dano_max, 20);
  assert.equal(encontrado.item.weaponProperties.valor_bonus_atributo, 5);
  assert.ok(encontrado.instancia.propriedades_efetivas, "propriedades_efetivas precisa ser calculado a partir do weaponProperties de verdade, não de um item sem include");
  assert.ok(Number.isFinite(encontrado.instancia.propriedades_efetivas.dano_min));
});

testeComBanco("mercado: listarAnuncios devolve consumableProperties pra um consumível anunciado (stack)", async () => {
  const { personagem: vendedor } = await novoPersonagem();
  const item = await Item.create({
    nome: `Poção de Teste ${sufixo()}`,
    descricao: "Restaura vida.",
    tipo_item: "Consumivel",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  await ConsumableProperties.create({ id_item: item.id, efeito_vida: 30, efeito_mana: 0 });

  await CharacterInventory.create({ id_personagem: vendedor.id, id_item: item.id, quantidade: 5 });

  const listing = await MarketListing.create({
    id_personagem_vendedor: vendedor.id,
    id_item: item.id,
    quantidade_total: 3,
    quantidade_restante: 3,
    preco_unitario: 10,
    status: "Ativo",
  });
  listingsCriadas.push(listing.id);

  const req = { query: {} };
  const res = fakeRes();
  await marketController.listarAnuncios(req, res);

  const encontrado = res.body.data.listings.find((l) => l.id === listing.id);
  assert.ok(encontrado, "o anúncio de consumível precisa aparecer na listagem");
  assert.ok(encontrado.item.consumableProperties, "item.consumableProperties precisa vir preenchido pra mostrar o efeito no Mercado");
  assert.equal(encontrado.item.consumableProperties.efeito_vida, 30);
});
