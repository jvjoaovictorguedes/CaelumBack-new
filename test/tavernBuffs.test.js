// Sistema de Taverna §19.2 — Cardápio/Buffs: compra cria a categoria
// certa, nova oferta da mesma categoria substitui a anterior,
// categorias diferentes coexistem, buffs expirados não contam,
// contexto de competitivo bloqueado nunca aplica bônus, e o cliente
// nunca controla magnitude/duração/preço (o service só aceita o ID da
// oferta, nunca esses campos).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const TavernMenuItem = require("../src/models/TavernMenuItem");
const CharacterTavernBuff = require("../src/models/CharacterTavernBuff");
const tavernBuffService = require("../src/services/tavernBuffService");

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
test.after(async () => {
  if (!temBanco) return;
  await CharacterTavernBuff.destroy({ where: { source_menu_item_id: itensCriados.length ? itensCriados : [-1] } });
  await TavernMenuItem.destroy({ where: { id: itensCriados.length ? itensCriados : [-1] } });
  await sequelize.close();
});

async function criarOferta({ categoria, buffKey, magnitude, precoGold = 10, duracaoSegundos = 3600 }) {
  const item = await TavernMenuItem.create({
    nome: `Oferta de teste ${sufixo()}`,
    descricao: "teste",
    categoria,
    preco_gold: precoGold,
    buff_key: buffKey,
    magnitude,
    duracao_segundos: duracaoSegundos,
    ativo: true,
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("compra cria buff na categoria correta e debita o preço", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 100;
  await personagem.save();

  const oferta = await criarOferta({ categoria: "Refeicao", buffKey: "ADVENTURE_XP_PCT", magnitude: 5 });
  const resultado = await tavernBuffService.consumirOferta(personagem.id, oferta.id);

  assert.equal(resultado.buff.categoria, "Refeicao");
  assert.equal(resultado.buff.buff_key, "ADVENTURE_XP_PCT");
  assert.equal(resultado.dinheiro, 90);
});

testeComBanco("nova oferta da mesma categoria substitui a anterior (uma linha só)", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 100;
  await personagem.save();

  const ofertaA = await criarOferta({ categoria: "Bebida", buffKey: "FORGE_XP_PCT", magnitude: 5 });
  const ofertaB = await criarOferta({ categoria: "Bebida", buffKey: "EXPEDITION_XP_PCT", magnitude: 8 });

  await tavernBuffService.consumirOferta(personagem.id, ofertaA.id);
  await tavernBuffService.consumirOferta(personagem.id, ofertaB.id);

  const linhas = await CharacterTavernBuff.findAll({ where: { id_personagem: personagem.id, categoria: "Bebida" } });
  assert.equal(linhas.length, 1, "categoria Bebida deveria ter só 1 linha ATUAL");
  assert.equal(linhas[0].buff_key, "EXPEDITION_XP_PCT");
});

testeComBanco("categorias diferentes coexistem", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 100;
  await personagem.save();

  const refeicao = await criarOferta({ categoria: "Refeicao", buffKey: "PVE_DAMAGE_PCT", magnitude: 4 });
  const bebida = await criarOferta({ categoria: "Bebida", buffKey: "MAX_MANA_PCT", magnitude: 5 });

  await tavernBuffService.consumirOferta(personagem.id, refeicao.id);
  await tavernBuffService.consumirOferta(personagem.id, bebida.id);

  const bonuses = await tavernBuffService.bonusesAtivosPara(personagem.id);
  assert.equal(bonuses.PVE_DAMAGE_PCT, 4);
  assert.equal(bonuses.MAX_MANA_PCT, 5);
});

testeComBanco("buff expirado não conta em bonusesAtivosPara", async () => {
  const { personagem } = await criarPersonagem();
  const oferta = await criarOferta({ categoria: "Refeicao", buffKey: "FISHING_CONTROL_PCT", magnitude: 5 });

  await CharacterTavernBuff.create({
    id_personagem: personagem.id,
    categoria: "Refeicao",
    buff_key: oferta.buff_key,
    magnitude: oferta.magnitude,
    source_menu_item_id: oferta.id,
    activated_at: new Date(Date.now() - 10_000),
    expires_at: new Date(Date.now() - 1_000),
  });

  const bonuses = await tavernBuffService.bonusesAtivosPara(personagem.id);
  assert.equal(bonuses.FISHING_CONTROL_PCT, undefined, "buff expirado nunca deveria contar");
});

testeComBanco("contexto de competitivo bloqueado nunca recebe bônus da Taverna", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 100;
  await personagem.save();
  const oferta = await criarOferta({ categoria: "Refeicao", buffKey: "PVE_DAMAGE_PCT", magnitude: 10 });
  await tavernBuffService.consumirOferta(personagem.id, oferta.id);

  for (const contexto of ["Ranqueada", "TorneioPvP", "TorneioPesca", "PvpCasual"]) {
    const bonuses = await tavernBuffService.bonusesAtivosPara(personagem.id, contexto);
    assert.deepEqual(bonuses, {}, `contexto ${contexto} deveria vir sempre vazio`);
  }
});

testeComBanco("recusa oferta desativada e não altera saldo", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 100;
  await personagem.save();

  const oferta = await criarOferta({ categoria: "Refeicao", buffKey: "ALCHEMY_XP_PCT", magnitude: 5 });
  await oferta.update({ ativo: false });

  await assert.rejects(
    () => tavernBuffService.consumirOferta(personagem.id, oferta.id),
    (erro) => {
      assert.equal(erro.statusCode, 404);
      return true;
    },
  );

  await personagem.reload();
  assert.equal(personagem.dinheiro, 100);
});
