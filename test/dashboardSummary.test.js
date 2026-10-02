// Dashboard V2 — "Centro do Aventureiro" (dashboardSummaryService.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
require("../src/controllers/guildController");

const User = require("../src/models/User");
const Character = require("../src/models/Character");
const PlayerShop = require("../src/models/PlayerShop");
const MarketListing = require("../src/models/MarketListing");
const Item = require("../src/models/Item");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterForgeProgress = require("../src/models/CharacterForgeProgress");
const playerShopService = require("../src/services/playerShopService");
const forgeService = require("../src/services/forgeService");
const dashboardSummaryService = require("../src/services/dashboardSummaryService");

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

testeComBanco("dashboard: personagem sem loja/guilda devolve DTO compacto com os 'exists: false' certos", async () => {
  const { personagem } = await novoPersonagem();

  const resumo = await dashboardSummaryService.buildForCharacter(personagem.id);

  assert.equal(resumo.character.id, personagem.id);
  assert.equal(resumo.character.nome, personagem.nome);
  assert.equal(resumo.shop.exists, false);
  assert.equal(resumo.guild.exists, false);
  assert.equal(resumo.unreadMessages, 0);
  assert.ok(Array.isArray(resumo.attentionItems));
  assert.ok(Array.isArray(resumo.activities));
  assert.ok(typeof resumo.generatedAt === "string" && !Number.isNaN(Date.parse(resumo.generatedAt)));
});

testeComBanco("dashboard: personagem sem personagem nenhum (id inexistente) lança 404", async () => {
  await assert.rejects(
    () => dashboardSummaryService.buildForCharacter(999999999),
    (error) => error.statusCode === 404,
  );
});

testeComBanco("dashboard: resumo da loja usa a contagem real de produtos ativos, nunca inventário/MarketListing cru", async () => {
  const { personagem } = await novoPersonagem();
  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });

  const item = await Item.create({
    nome: `Item ${sufixo()}`,
    descricao: "Item de teste.",
    tipo_item: "Material",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);

  const listing = await MarketListing.create({
    id_personagem_vendedor: personagem.id,
    id_item: item.id,
    quantidade: 1,
    quantidade_total: 1,
    quantidade_restante: 1,
    preco_unitario: 10,
    preco_total: 10,
    status: "Ativo",
  });
  listingsCriadas.push(listing.id);

  const resumo = await dashboardSummaryService.buildForCharacter(personagem.id);

  assert.equal(resumo.shop.exists, true);
  assert.equal(resumo.shop.activeProducts, 1);
});

testeComBanco("dashboard: falha isolada num domínio (forja) não derruba o resumo inteiro", async () => {
  const { personagem } = await novoPersonagem();

  const original = forgeService.listarFila;
  forgeService.listarFila = async () => {
    throw new Error("falha simulada da Forja");
  };
  try {
    const resumo = await dashboardSummaryService.buildForCharacter(personagem.id);
    assert.equal(resumo.character.id, personagem.id);
    assert.ok(Array.isArray(resumo.activities), "o resto do resumo continua montado mesmo com a Forja falhando");
  } finally {
    forgeService.listarFila = original;
  }
});
