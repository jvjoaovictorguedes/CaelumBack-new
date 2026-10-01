// Bestiário — mistério da contagem: o jogador não pode saber o TOTAL de
// monstros de uma área (nem pela "???" por monstro faltando, nem pelo
// "X / Y" do resumo) até descobrir todos eles. Ver bestiaryService.js
// (listarRegioes/obterRegiao) — `total` vem `null` enquanto incompleto.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const bestiaryService = require("../src/services/bestiaryService");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureMonster = require("../src/models/AdventureMonster");
const CharacterMonsterKill = require("../src/models/CharacterMonsterKill");

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

async function marcarDescoberto(idPersonagem, nomeMonstro) {
  await CharacterMonsterKill.create({
    id_personagem: idPersonagem,
    nome_monstro: nomeMonstro,
    quantidade: 1,
    primeira_derrota_em: new Date(),
  });
}

testeComBanco(
  "obterRegiao nunca revela o total nem a quantidade de não descobertos antes de completar a área",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 5 });
    const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
    assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

    const nomesDaArea = ["Rato das Campinas", "Javali Selvagem", "Goblin Batedor", "Lobo Alfa da Campina"];
    const monstros = await AdventureMonster.findAll({ where: { nome: nomesDaArea } });
    assert.equal(monstros.length, 4, "esperava os 4 monstros de Campos dos Viajantes cadastrados");

    // Nenhum monstro descoberto ainda.
    let ficha = await bestiaryService.obterRegiao(personagem.id, zona.id);
    assert.equal(ficha.zona.total, null, "total não pode vazar com 0 descobertos");
    assert.equal(ficha.zona.descobertos, 0);
    assert.equal(ficha.zona.ha_nao_descobertos, true);
    assert.equal(ficha.monstros.length, 0, "array não pode ter um '???' por monstro faltando (vazaria a contagem)");

    // Descobre 3 dos 4 — ainda incompleto.
    await marcarDescoberto(personagem.id, "Rato das Campinas");
    await marcarDescoberto(personagem.id, "Javali Selvagem");
    await marcarDescoberto(personagem.id, "Goblin Batedor");

    ficha = await bestiaryService.obterRegiao(personagem.id, zona.id);
    assert.equal(ficha.zona.total, null, "total ainda tem que ficar em segredo faltando 1 monstro");
    assert.equal(ficha.zona.descobertos, 3);
    assert.equal(ficha.zona.ha_nao_descobertos, true);
    assert.equal(ficha.monstros.length, 3, "só os 3 já descobertos podem aparecer no array");
    assert.ok(ficha.monstros.every((m) => m.descoberto === true), "nenhum placeholder de não descoberto deve sobrar");

    // Descobre o último — agora pode revelar.
    await marcarDescoberto(personagem.id, "Lobo Alfa da Campina");

    ficha = await bestiaryService.obterRegiao(personagem.id, zona.id);
    assert.equal(ficha.zona.total, 4, "com a área 100% descoberta, o total pode (e deve) aparecer");
    assert.equal(ficha.zona.descobertos, 4);
    assert.equal(ficha.zona.ha_nao_descobertos, false);
    assert.equal(ficha.monstros.length, 4);
  },
);

testeComBanco("listarRegioes esconde o total por região e o agregado global enquanto houver região incompleta", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });

  const { regioes, resumo } = await bestiaryService.listarRegioes(personagem.id);
  const minhaRegiao = regioes.find((r) => r.id === zona.id);

  assert.ok(minhaRegiao, "região de Campos dos Viajantes deve aparecer na listagem (nome/imagem nunca é segredo)");
  assert.equal(minhaRegiao.total, null, "total da região incompleta não pode vazar na listagem geral");
  assert.equal(minhaRegiao.descobertos, 0);
  assert.equal(resumo.criaturas_totais, null, "agregado global não pode vazar enquanto alguma região está incompleta");
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
