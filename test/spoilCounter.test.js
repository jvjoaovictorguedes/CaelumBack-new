// Balcão de Espólios — Venda, Encomendas e Reputação da Guilda dos
// Aventureiros. Cobre a parte pura (Reputação/janela, sem banco) e o
// fluxo ponta a ponta com banco real (geração de encomendas, entrega,
// bônus 5/5, venda, idempotência e concorrência).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const {
  resolverNivel,
  formatarResumoReputacao,
  sortearPercentualBonus,
} = require("../src/services/spoilReputationService");
const { inicioDaJanelaDeEncomendas, SPOIL_ORDER_QUANTITY_RANGES } = require("../src/config/adventureGuildConfig");
const { obterCicloAtual } = require("../src/services/spoilOrderRotationService");
const { entregarEncomenda } = require("../src/services/spoilOrderService");
const { venderEspolios, atualizarPreferencia, listarEspolios } = require("../src/services/spoilCounterService");
const { addStack } = require("../src/services/inventoryService");
const Character = require("../src/models/Character");
const Item = require("../src/models/Item");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureMonsterLoot = require("../src/models/AdventureMonsterLoot");
const CharacterSpoilOrderCycle = require("../src/models/CharacterSpoilOrderCycle");
const CharacterSpoilOrder = require("../src/models/CharacterSpoilOrder");

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

// ---------------------------------------------------------------------
// spoilReputationService — puro, sem banco
// ---------------------------------------------------------------------

test("resolverNivel: marcos exatos 0/2000/7000/17000/35500 produzem I-V", () => {
  assert.equal(resolverNivel(0).roman, "I");
  assert.equal(resolverNivel(1999).roman, "I");
  assert.equal(resolverNivel(2000).roman, "II");
  assert.equal(resolverNivel(6999).roman, "II");
  assert.equal(resolverNivel(7000).roman, "III");
  assert.equal(resolverNivel(16999).roman, "III");
  assert.equal(resolverNivel(17000).roman, "IV");
  assert.equal(resolverNivel(35499).roman, "IV");
  assert.equal(resolverNivel(35500).roman, "V");
});

test("resolverNivel: acima do nível V permanece V com multiplicador 1.70x", () => {
  const nivel = resolverNivel(999_999);
  assert.equal(nivel.roman, "V");
  assert.equal(nivel.multiplicador, 1.7);
});

test("formatarResumoReputacao: nextLevelAt correto e null no nível V", () => {
  assert.equal(formatarResumoReputacao(0).nextLevelAt, 2000);
  assert.equal(formatarResumoReputacao(8450).nextLevelAt, 17000);
  assert.equal(formatarResumoReputacao(35500).nextLevelAt, null);
  assert.equal(formatarResumoReputacao(50000).nextLevelAt, null);
});

test("sortearPercentualBonus: sempre dentro da faixa do nível", () => {
  const nivel = resolverNivel(0); // I: 10%-20%
  for (let i = 0; i < 200; i += 1) {
    const percentual = sortearPercentualBonus(nivel);
    assert.ok(percentual >= 0.1 && percentual <= 0.2, `percentual ${percentual} fora da faixa`);
  }
});

test("inicioDaJanelaDeEncomendas: borda 03:59:59/04:00:00 UTC cai em janelas diferentes", () => {
  const antes = new Date("2026-09-24T03:59:59.000Z");
  const depois = new Date("2026-09-24T04:00:00.000Z");
  const janelaAntes = inicioDaJanelaDeEncomendas(antes);
  const janelaDepois = inicioDaJanelaDeEncomendas(depois);
  assert.equal(janelaAntes.toISOString(), "2026-09-24T00:00:00.000Z");
  assert.equal(janelaDepois.toISOString(), "2026-09-24T04:00:00.000Z");
  assert.notEqual(janelaAntes.getTime(), janelaDepois.getTime());
});

test("inicioDaJanelaDeEncomendas: mesmo instante sempre produz a mesma janela (estabilidade)", () => {
  const agora = new Date("2026-09-24T05:30:00.000Z");
  assert.equal(inicioDaJanelaDeEncomendas(agora).getTime(), inicioDaJanelaDeEncomendas(agora).getTime());
});

// ---------------------------------------------------------------------
// Fluxo completo com banco real
// ---------------------------------------------------------------------

// Cria um espólio de teste + monstro/loot pra ele aparecer no pool
// elegível de obterPoolDeEspoliosElegiveis.
async function criarEspolioElegivel({ raridade = "Comum", valorVenda = 20 } = {}) {
  const chave = sufixo();
  const item = await Item.create({
    nome: `Espólio Teste ${chave}`,
    descricao: "item de teste",
    tipo_item: "Espolio",
    raridade,
    valor_venda: valorVenda,
  });
  const monstro = await AdventureMonster.create({ nome: `Monstro Teste ${chave}` });
  await AdventureMonsterLoot.create({
    id_monstro: monstro.id,
    id_item: item.id,
    chance_ppm: 1_000_000,
    quantidade_min: 1,
    quantidade_max: 1,
  });
  return item;
}

testeComBanco("obterCicloAtual: gera exatamente 5 encomendas, estáveis entre chamadas (refresh)", async () => {
  await criarEspolioElegivel();
  const { personagem } = await criarPersonagem();

  const primeira = await sequelize.transaction((t) => obterCicloAtual(personagem.id, t));
  assert.equal(primeira.encomendas.length, 5);
  for (const encomenda of primeira.encomendas) {
    const [min, max] = SPOIL_ORDER_QUANTITY_RANGES[encomenda.item.raridade];
    assert.ok(encomenda.quantidade_exigida >= min && encomenda.quantidade_exigida <= max);
    assert.equal(encomenda.valor_unitario_snapshot, encomenda.item.valor_venda);
  }

  const segunda = await sequelize.transaction((t) => obterCicloAtual(personagem.id, t));
  assert.equal(segunda.ciclo.id, primeira.ciclo.id);
  assert.deepEqual(
    segunda.encomendas.map((e) => e.id).sort(),
    primeira.encomendas.map((e) => e.id).sort(),
  );
});

// Cria um ciclo com 5 encomendas MANUAIS (itens conhecidos) — evita
// depender do sorteio de obterCicloAtual quando o teste precisa
// controlar exatamente valor/quantidade de cada vaga.
async function criarCicloManual(idPersonagem, { janelaInicio, janelaFim, itens }) {
  const ciclo = await CharacterSpoilOrderCycle.create({
    id_personagem: idPersonagem,
    janela_inicio: janelaInicio,
    janela_fim: janelaFim,
  });
  const encomendas = [];
  for (let i = 0; i < itens.length; i += 1) {
    const { item, quantidade } = itens[i];
    encomendas.push(
      await CharacterSpoilOrder.create({
        id_ciclo: ciclo.id,
        ordem: i + 1,
        id_item: item.id,
        quantidade_exigida: quantidade,
        valor_unitario_snapshot: item.valor_venda,
      }),
    );
  }
  return { ciclo, encomendas };
}

testeComBanco("entregarEncomenda: sucesso concede ouro+reputação e bloqueia reentrega", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 10 });
  const { personagem } = await criarPersonagem();
  const janelaInicio = inicioDaJanelaDeEncomendas();
  const janelaFim = new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000);
  const { encomendas } = await criarCicloManual(personagem.id, {
    janelaInicio,
    janelaFim,
    itens: [{ item, quantidade: 8 }],
  });

  await addStack(personagem.id, item.id, 8, null);

  const dinheiroAntes = (await Character.findByPk(personagem.id)).dinheiro;
  const resultado = await sequelize.transaction((t) => entregarEncomenda(personagem.id, encomendas[0].id, t));
  assert.equal(resultado.reward.gold, Math.floor(8 * 10 * 1.2)); // nível I = 1.20x
  assert.equal(resultado.reward.reputation, 5);
  const dinheiroDepois = (await Character.findByPk(personagem.id)).dinheiro;
  assert.equal(dinheiroDepois, dinheiroAntes + resultado.reward.gold);

  await assert.rejects(
    sequelize.transaction((t) => entregarEncomenda(personagem.id, encomendas[0].id, t)),
    (erro) => erro.statusCode === 409,
  );
});

testeComBanco("entregarEncomenda: inventário insuficiente falha com 400", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 10 });
  const { personagem } = await criarPersonagem();
  const janelaInicio = inicioDaJanelaDeEncomendas();
  const janelaFim = new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000);
  const { encomendas } = await criarCicloManual(personagem.id, {
    janelaInicio,
    janelaFim,
    itens: [{ item, quantidade: 5 }],
  });
  // Não adiciona o item ao inventário de propósito.
  await assert.rejects(
    sequelize.transaction((t) => entregarEncomenda(personagem.id, encomendas[0].id, t)),
    (erro) => erro.statusCode === 400,
  );
});

testeComBanco("entregarEncomenda: janela expirada não pode ser entregue mesmo com estoque", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 10 });
  const { personagem } = await criarPersonagem();
  const janelaAntiga = new Date(inicioDaJanelaDeEncomendas().getTime() - 4 * 60 * 60 * 1000);
  const { encomendas } = await criarCicloManual(personagem.id, {
    janelaInicio: janelaAntiga,
    janelaFim: new Date(janelaAntiga.getTime() + 4 * 60 * 60 * 1000),
    itens: [{ item, quantidade: 3 }],
  });
  await addStack(personagem.id, item.id, 3, null);

  await assert.rejects(
    sequelize.transaction((t) => entregarEncomenda(personagem.id, encomendas[0].id, t)),
    (erro) => erro.statusCode === 409,
  );
});

testeComBanco("entregarEncomenda: completar 5/5 concede o bônus de lote exatamente uma vez", async () => {
  const { personagem } = await criarPersonagem();
  const janelaInicio = inicioDaJanelaDeEncomendas();
  const janelaFim = new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000);

  const itens = [];
  for (let i = 0; i < 5; i += 1) {
    itens.push({ item: await criarEspolioElegivel({ valorVenda: 20 }), quantidade: 8 });
  }
  const { encomendas } = await criarCicloManual(personagem.id, { janelaInicio, janelaFim, itens });
  for (const { item, quantidade } of itens) {
    await addStack(personagem.id, item.id, quantidade, null);
  }

  let ultimoResultado;
  for (const encomenda of encomendas) {
    ultimoResultado = await sequelize.transaction((t) => entregarEncomenda(personagem.id, encomenda.id, t));
  }

  assert.ok(ultimoResultado.setBonus, "quinta entrega deveria conceder o bônus de lote");
  assert.equal(ultimoResultado.setBonus.reputation, 25);
  // valor_base_total_ciclo = 5 * (8*20) = 800; faixa do nível vigente após +5+25=30 pontos ainda é I (10%-20%)
  assert.ok(ultimoResultado.setBonus.percentual >= 0.1 && ultimoResultado.setBonus.percentual <= 0.2);
  assert.ok(ultimoResultado.setBonus.gold >= Math.floor(800 * 0.1) && ultimoResultado.setBonus.gold <= Math.floor(800 * 0.2));
  assert.equal(ultimoResultado.reputation.points, 5 * 5 + 25);

  const ciclo = await CharacterSpoilOrderCycle.findOne({ where: { id_personagem: personagem.id, janela_inicio: janelaInicio } });
  assert.equal(ciclo.bonus_lote_concedido, true);
});

testeComBanco("entregarEncomenda: duas entregas concorrentes na mesma encomenda pagam só uma vez", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 10 });
  const { personagem } = await criarPersonagem();
  const janelaInicio = inicioDaJanelaDeEncomendas();
  const janelaFim = new Date(janelaInicio.getTime() + 4 * 60 * 60 * 1000);
  const { encomendas } = await criarCicloManual(personagem.id, {
    janelaInicio,
    janelaFim,
    itens: [{ item, quantidade: 5 }],
  });
  await addStack(personagem.id, item.id, 5, null);

  const resultados = await Promise.allSettled([
    sequelize.transaction((t) => entregarEncomenda(personagem.id, encomendas[0].id, t)),
    sequelize.transaction((t) => entregarEncomenda(personagem.id, encomendas[0].id, t)),
  ]);

  const sucesso = resultados.filter((r) => r.status === "fulfilled");
  const falha = resultados.filter((r) => r.status === "rejected");
  assert.equal(sucesso.length, 1);
  assert.equal(falha.length, 1);
});

testeComBanco("venda: linha única, lote, reserva e proteção", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 15 });
  const { personagem } = await criarPersonagem();
  await addStack(personagem.id, item.id, 20, null);

  // Reserva 5 -> só 15 vendáveis.
  await sequelize.transaction((t) => atualizarPreferencia(personagem.id, item.id, { quantidadeReservada: 5 }, t));
  const espolios = await sequelize.transaction((t) => listarEspolios(personagem.id, t));
  const entrada = espolios.find((e) => e.item.id === item.id);
  assert.equal(entrada.quantidade_vendavel, 15);

  await assert.rejects(
    sequelize.transaction((t) => venderEspolios(personagem.id, [{ itemId: item.id, quantidade: 16 }], `k1-${sufixo()}`, t)),
    (erro) => erro.statusCode === 400,
  );

  const chaveOk = `k2-${sufixo()}`;
  const dinheiroAntes = (await Character.findByPk(personagem.id)).dinheiro;
  const resultado = await sequelize.transaction((t) => venderEspolios(personagem.id, [{ itemId: item.id, quantidade: 10 }], chaveOk, t));
  assert.equal(resultado.totalOuro, 150);
  const dinheiroDepois = (await Character.findByPk(personagem.id)).dinheiro;
  assert.equal(dinheiroDepois, dinheiroAntes + 150);

  // Proteção bloqueia até venda de 1 unidade restante vendável.
  await sequelize.transaction((t) =>
    atualizarPreferencia(personagem.id, item.id, { protegidoVenda: true, quantidadeReservada: 0 }, t),
  );
  await assert.rejects(
    sequelize.transaction((t) => venderEspolios(personagem.id, [{ itemId: item.id, quantidade: 1 }], `k3-${sufixo()}`, t)),
    (erro) => erro.statusCode === 400,
  );
});

testeComBanco("venda: idempotencyKey repetida com o mesmo pedido não cobra duas vezes", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 10 });
  const { personagem } = await criarPersonagem();
  await addStack(personagem.id, item.id, 10, null);

  const chave = `idem-${sufixo()}`;
  const linhas = [{ itemId: item.id, quantidade: 4 }];

  const primeira = await sequelize.transaction((t) => venderEspolios(personagem.id, linhas, chave, t));
  assert.equal(primeira.repetida, false);
  const dinheiroApos1a = (await Character.findByPk(personagem.id)).dinheiro;

  const segunda = await sequelize.transaction((t) => venderEspolios(personagem.id, linhas, chave, t));
  assert.equal(segunda.repetida, true);
  assert.equal(segunda.totalOuro, primeira.totalOuro);
  const dinheiroApos2a = (await Character.findByPk(personagem.id)).dinheiro;
  assert.equal(dinheiroApos2a, dinheiroApos1a, "replay não pode cobrar de novo");
});

testeComBanco("venda: idempotencyKey repetida com pedido DIFERENTE falha com 409", async () => {
  const item = await criarEspolioElegivel({ valorVenda: 10 });
  const { personagem } = await criarPersonagem();
  await addStack(personagem.id, item.id, 10, null);

  const chave = `idem-conflito-${sufixo()}`;
  await sequelize.transaction((t) => venderEspolios(personagem.id, [{ itemId: item.id, quantidade: 2 }], chave, t));

  await assert.rejects(
    sequelize.transaction((t) => venderEspolios(personagem.id, [{ itemId: item.id, quantidade: 3 }], chave, t)),
    (erro) => erro.statusCode === 409,
  );
});

testeComBanco("venda: item com valor_venda zero/negativo nunca é vendável", async () => {
  const chave = sufixo();
  const itemSemValor = await Item.create({
    nome: `Espólio Sem Valor ${chave}`,
    descricao: "teste",
    tipo_item: "Espolio",
    raridade: "Comum",
    valor_venda: 0,
  });
  const { personagem } = await criarPersonagem();
  await addStack(personagem.id, itemSemValor.id, 5, null);

  await assert.rejects(
    sequelize.transaction((t) =>
      venderEspolios(personagem.id, [{ itemId: itemSemValor.id, quantidade: 1 }], `k-${sufixo()}`, t),
    ),
    (erro) => erro.statusCode === 400,
  );
});
