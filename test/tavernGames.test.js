// Sistema de Taverna §19.3 — Jogos: valida min/max e saldo, vitória
// paga floor(aposta * payout_multiplier), derrota paga zero, request_id
// repetido nunca rerola, duas apostas concorrentes nunca gastam o mesmo
// saldo, jogo inativo recusa aposta, choice_key inválida é rejeitada e
// o histórico pertence só ao personagem autenticado.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const TavernGame = require("../src/models/TavernGame");
const TavernGameBet = require("../src/models/TavernGameBet");
const tavernGameService = require("../src/services/tavernGameService");

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

const jogosCriados = [];
test.after(async () => {
  if (!temBanco) return;
  await TavernGameBet.destroy({ where: { id_game: jogosCriados.length ? jogosCriados : [-1] } });
  await TavernGame.destroy({ where: { id: jogosCriados.length ? jogosCriados : [-1] } });
  await sequelize.close();
});

// win_chance_ppm=1_000_000 (sempre vence) ou 0 (sempre perde) tira o
// acaso do teste — o que importa aqui é a mecânica, não a sorte.
async function criarJogo({ winChancePpm = 1_000_000, payoutMultiplier = 1.9, minBet = 10, maxBet = 1000 } = {}) {
  const jogo = await TavernGame.create({
    key: `teste_${sufixo()}`,
    nome: "Jogo de teste",
    descricao: "teste",
    presentation_key: "COIN",
    win_chance_ppm: winChancePpm,
    payout_multiplier: payoutMultiplier,
    min_bet: minBet,
    max_bet: maxBet,
    ativo: true,
  });
  jogosCriados.push(jogo.id);
  return jogo;
}

testeComBanco("vitória paga floor(aposta * payout_multiplier) e debita a aposta antes", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 1000;
  await personagem.save();

  const jogo = await criarJogo({ winChancePpm: 1_000_000, payoutMultiplier: 1.9 });
  const resultado = await tavernGameService.apostar(personagem.id, jogo.id, {
    requestId: crypto.randomUUID(),
    betAmount: 100,
    choiceKey: "HEADS",
  });

  assert.equal(resultado.outcome, "Win");
  assert.equal(resultado.payout_amount, Math.floor(100 * 1.9));
  assert.equal(resultado.net_change, Math.floor(100 * 1.9) - 100);
  assert.equal(resultado.dinheiro, 1000 - 100 + Math.floor(100 * 1.9));
});

testeComBanco("derrota paga zero e só debita a aposta", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 1000;
  await personagem.save();

  const jogo = await criarJogo({ winChancePpm: 0 });
  const resultado = await tavernGameService.apostar(personagem.id, jogo.id, {
    requestId: crypto.randomUUID(),
    betAmount: 100,
    choiceKey: "TAILS",
  });

  assert.equal(resultado.outcome, "Lose");
  assert.equal(resultado.payout_amount, 0);
  assert.equal(resultado.net_change, -100);
  assert.equal(resultado.dinheiro, 900);
});

testeComBanco("request_id repetido retorna o MESMO resultado e não rerola", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 1000;
  await personagem.save();

  const jogo = await criarJogo({ winChancePpm: 1_000_000 });
  const requestId = crypto.randomUUID();

  const primeiro = await tavernGameService.apostar(personagem.id, jogo.id, {
    requestId,
    betAmount: 100,
    choiceKey: "HEADS",
  });
  const segundo = await tavernGameService.apostar(personagem.id, jogo.id, {
    requestId,
    betAmount: 100,
    choiceKey: "HEADS",
  });

  assert.deepEqual(primeiro, segundo);

  const apostasNoBanco = await TavernGameBet.count({ where: { id_personagem: personagem.id, request_id: requestId } });
  assert.equal(apostasNoBanco, 1, "retry nunca deveria criar uma segunda aposta");

  await personagem.reload();
  assert.equal(personagem.dinheiro, 1000 - 100 + Math.floor(100 * jogo.payout_multiplier), "cobrança não deveria dobrar no retry");
});

testeComBanco("recusa bet_amount fora de min/max", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 1000;
  await personagem.save();

  const jogo = await criarJogo({ minBet: 10, maxBet: 100 });

  await assert.rejects(() =>
    tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 5, choiceKey: "HEADS" }),
  );
  await assert.rejects(() =>
    tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 500, choiceKey: "HEADS" }),
  );
});

testeComBanco("recusa saldo insuficiente sem debitar nada", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 5;
  await personagem.save();

  const jogo = await criarJogo();
  await assert.rejects(
    () => tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 100, choiceKey: "HEADS" }),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      return true;
    },
  );

  await personagem.reload();
  assert.equal(personagem.dinheiro, 5);
});

testeComBanco("recusa choice_key fora das opções válidas da apresentação", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 1000;
  await personagem.save();

  const jogo = await criarJogo(); // COIN → HEADS/TAILS
  await assert.rejects(() =>
    tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 50, choiceKey: "GOLD" }),
  );
});

testeComBanco("jogo inativo não aceita aposta", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 1000;
  await personagem.save();

  const jogo = await criarJogo();
  await jogo.update({ ativo: false });

  await assert.rejects(
    () => tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 50, choiceKey: "HEADS" }),
    (erro) => {
      assert.equal(erro.statusCode, 404);
      return true;
    },
  );
});

testeComBanco("duas apostas concorrentes com request_id diferentes nunca gastam o mesmo saldo", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 150;
  await personagem.save();

  const jogo = await criarJogo({ winChancePpm: 0 }); // sempre perde — simplifica a conta
  const [r1, r2] = await Promise.allSettled([
    tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 100, choiceKey: "HEADS" }),
    tavernGameService.apostar(personagem.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 100, choiceKey: "HEADS" }),
  ]);

  const sucesso = [r1, r2].filter((r) => r.status === "fulfilled");
  const falha = [r1, r2].filter((r) => r.status === "rejected");
  // Só cabe UMA aposta de 100 num saldo de 150 — a segunda tem que
  // falhar por saldo insuficiente, nunca as duas passarem.
  assert.equal(sucesso.length, 1);
  assert.equal(falha.length, 1);

  await personagem.reload();
  assert.equal(personagem.dinheiro, 50);
});

testeComBanco("histórico só devolve apostas do próprio personagem", async () => {
  const { personagem: p1 } = await criarPersonagem();
  const { personagem: p2 } = await criarPersonagem();
  p1.dinheiro = 1000;
  p2.dinheiro = 1000;
  await Promise.all([p1.save(), p2.save()]);

  const jogo = await criarJogo();
  await tavernGameService.apostar(p1.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 20, choiceKey: "HEADS" });
  await tavernGameService.apostar(p2.id, jogo.id, { requestId: crypto.randomUUID(), betAmount: 20, choiceKey: "HEADS" });

  const historicoP1 = await tavernGameService.historicoDoPersonagem(p1.id);
  assert.ok(historicoP1.every((bet) => bet.id_personagem === p1.id));
  assert.ok(!historicoP1.some((bet) => bet.id_personagem === p2.id));
});
