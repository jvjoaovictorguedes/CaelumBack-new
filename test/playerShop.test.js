// Loja do Aventureiro V2 — Fase 3 (perfil da loja). playerShopService.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const Character = require("../src/models/Character");
const PlayerShop = require("../src/models/PlayerShop");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const Item = require("../src/models/Item");
const CharacterInventory = require("../src/models/CharacterInventory");
const MarketListing = require("../src/models/MarketListing");
const playerShopService = require("../src/services/playerShopService");
const playerShopController = require("../src/controllers/playerShopController");

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

const personagensCriados = [];
const usuariosCriados = [];
const itensCriados = [];
const listingsCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (listingsCriadas.length > 0) await MarketListing.destroy({ where: { id: listingsCriadas } });
  if (personagensCriados.length > 0) {
    await PlayerShop.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterForgeProgress.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterInventory.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return { usuario, personagem };
}

testeComBanco("loja: criarOuAtualizarLoja cria na primeira vez e atualiza na segunda (nunca duplica)", async () => {
  const { personagem } = await novoPersonagem();

  const criada = await playerShopService.criarOuAtualizarLoja(personagem.id, {
    nome: `Loja do ${sufixo()}`,
    descricao: "Vendo de tudo um pouco.",
  });
  assert.equal(criada.id_personagem, personagem.id);
  assert.equal(criada.ativa, true);
  assert.equal(criada.aceita_encomendas, true);

  const atualizada = await playerShopService.criarOuAtualizarLoja(personagem.id, {
    nome: `Loja Renomeada ${sufixo()}`,
    aceita_encomendas: false,
  });
  assert.equal(atualizada.id, criada.id, "upsert tem que atualizar a MESMA linha, nunca criar uma segunda");
  assert.equal(atualizada.aceita_encomendas, false);

  const total = await PlayerShop.count({ where: { id_personagem: personagem.id } });
  assert.equal(total, 1, "só pode existir 1 loja por personagem mesmo depois de 2 upserts");
});

testeComBanco("loja: criarOuAtualizarLoja rejeita nome vazio/curto demais", async () => {
  const { personagem } = await novoPersonagem();
  await assert.rejects(
    () => playerShopService.criarOuAtualizarLoja(personagem.id, { nome: "Oi" }),
    /entre 3 e 100 caracteres/,
  );
});

testeComBanco("loja: obterPerfilPublico devolve profissões reais e estatísticas zeradas (sem demanda/encomenda ainda)", async () => {
  const { personagem } = await novoPersonagem();
  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });
  await CharacterForgeProgress.create({ id_personagem: personagem.id, nivel: 7, experiencia: 1234 });

  const perfil = await playerShopService.obterPerfilPublico(personagem.id);
  assert.equal(perfil.nome_personagem, personagem.nome);
  assert.equal(perfil.profissoes.ferreiro.nivel, 7);
  assert.equal(perfil.profissoes.alquimista, null);
  assert.equal(perfil.estatisticas.produtos_ativos, 0);
  assert.equal(perfil.estatisticas.demandas_concluidas, 0);
  assert.equal(perfil.estatisticas.encomendas_concluidas, 0);
});

testeComBanco("loja: obterPerfilPublico lança 404 quando o personagem não tem loja", async () => {
  const { personagem } = await novoPersonagem();
  await assert.rejects(
    () => playerShopService.obterPerfilPublico(personagem.id),
    (erro) => erro.statusCode === 404,
  );
});

testeComBanco("loja: listarLojasPublicas só mostra lojas ativas e respeita busca por nome", async () => {
  const { personagem: p1 } = await novoPersonagem();
  const { personagem: p2 } = await novoPersonagem();
  const nomeUnico = `Ferraria Exclusiva ${sufixo()}`;
  await playerShopService.criarOuAtualizarLoja(p1.id, { nome: nomeUnico });
  await playerShopService.criarOuAtualizarLoja(p2.id, { nome: `Loja Inativa ${sufixo()}`, ativa: false });

  const resultado = await playerShopService.listarLojasPublicas({ busca: nomeUnico });
  assert.equal(resultado.lojas.length, 1);
  assert.equal(resultado.lojas[0].id_personagem, p1.id);
});

testeComBanco("loja: criarProdutoDaLoja recusa publicar sem o personagem ter uma loja criada", async () => {
  const { personagem } = await novoPersonagem();
  const item = await Item.create({
    nome: `Poção da Loja ${sufixo()}`,
    descricao: "Restaura vida.",
    tipo_item: "Consumivel",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 5 });

  const req = { personagemAtual: personagem, body: { id_item: item.id, quantidade: 2, preco_unitario: 10 } };
  const res = fakeRes();
  await playerShopController.criarProdutoDaLoja(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Crie sua loja/);
});

testeComBanco("loja: criarProdutoDaLoja publica no MESMO marketService do Mercado Negro (sem duplicar lógica de venda)", async () => {
  const { personagem } = await novoPersonagem();
  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });

  const item = await Item.create({
    nome: `Poção da Loja ${sufixo()}`,
    descricao: "Restaura vida.",
    tipo_item: "Consumivel",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: item.id, quantidade: 5 });

  const req = { personagemAtual: personagem, body: { id_item: item.id, quantidade: 2, preco_unitario: 10 } };
  const res = fakeRes();
  await playerShopController.criarProdutoDaLoja(req, res);

  assert.equal(res.statusCode, 201);
  const listing = res.body.data.listing;
  listingsCriadas.push(listing.id);
  assert.equal(listing.id_personagem_vendedor, personagem.id);
  assert.equal(listing.quantidade_total, 2);
  assert.equal(listing.preco_unitario, 10);
  assert.equal(listing.status, "Ativo");

  const restante = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
  assert.equal(restante.quantidade, 3, "os 2 vendidos precisam ter saído do inventário (mesmo débito do Mercado Negro)");

  const totalNoMercado = await MarketListing.count({ where: { id_item: item.id, id_personagem_vendedor: personagem.id } });
  assert.equal(totalNoMercado, 1, "não pode existir uma tabela/listagem separada pra produtos da loja — é o MESMO MarketListing");
});
