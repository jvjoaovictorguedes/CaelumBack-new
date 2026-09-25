// Sistema de Taverna §19.1 — Descanso: preview reflete HP/Mana efetivos,
// confirmação restaura exatamente pros máximos, debita o custo correto,
// bloqueia durante combate PvE, recusa sem saldo e nunca cobra/cura em
// dobro sob concorrência (duas requisições simultâneas).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
require("../src/models/associations");

const tavernRestService = require("../src/services/tavernRestService");

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

testeComBanco("preview calcula custo com base no HP/Mana faltantes", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  personagem.vida_atual = Math.round(personagem.vida_atual * 0.5);
  personagem.mana_atual = Math.round(personagem.mana_atual * 0.5);
  personagem.dinheiro = 1000;
  await personagem.save();

  const preview = await tavernRestService.previewDescanso(personagem.id);
  assert.equal(preview.bloqueado, false);
  assert.ok(preview.custo > 0, "custo deveria ser positivo com recurso faltando");
  assert.equal(preview.saldo_suficiente, true);
});

testeComBanco("preview e confirmar concordam: HP/Mana cheios custam 0 e não cobram", async () => {
  const { personagem } = await criarPersonagem();
  personagem.dinheiro = 50;
  await personagem.save();

  // vida_atual/mana_atual de criarPersonagem() são valores fixos de
  // teste (100/50), não necessariamente o máximo efetivo REAL do
  // personagem — precisa igualar ao máximo de verdade antes de testar
  // o caminho "já está cheio".
  const previewInicial = await tavernRestService.previewDescanso(personagem.id);
  personagem.vida_atual = previewInicial.vida_maxima;
  personagem.mana_atual = previewInicial.mana_maxima;
  await personagem.save();

  const preview = await tavernRestService.previewDescanso(personagem.id);
  assert.equal(preview.custo, 0);

  const resultado = await tavernRestService.confirmarDescanso(personagem.id);
  assert.equal(resultado.custo_pago, 0);

  await personagem.reload();
  assert.equal(personagem.dinheiro, 50, "saldo insuficiente nao deveria mudar quando custo é 0");
});

testeComBanco("confirmar restaura exatamente para os máximos efetivos e debita o custo", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  personagem.vida_atual = 1;
  personagem.mana_atual = 1;
  personagem.dinheiro = 1000;
  await personagem.save();

  const preview = await tavernRestService.previewDescanso(personagem.id);
  const saldoAntes = personagem.dinheiro;

  const resultado = await tavernRestService.confirmarDescanso(personagem.id);
  assert.equal(resultado.custo_pago, preview.custo, "custo cobrado deve bater com o preview");
  assert.equal(resultado.vida_atual, resultado.vida_maxima);
  assert.equal(resultado.mana_atual, resultado.mana_maxima);

  await personagem.reload();
  assert.equal(personagem.dinheiro, saldoAntes - resultado.custo_pago);
  assert.equal(personagem.vida_atual, resultado.vida_maxima);
  assert.equal(personagem.mana_atual, resultado.mana_maxima);
});

testeComBanco("combate PvE ativo bloqueia o descanso e não cobra/cura", async () => {
  const { personagem } = await criarPersonagem();
  personagem.vida_atual = 1;
  personagem.dinheiro = 1000;
  personagem.encontro_pve = { idMonstro: 1, nivel: 1 };
  await personagem.save();

  await assert.rejects(
    () => tavernRestService.confirmarDescanso(personagem.id),
    (erro) => {
      assert.equal(erro.statusCode, 409);
      return true;
    },
  );

  await personagem.reload();
  assert.equal(personagem.vida_atual, 1, "descanso bloqueado não deveria curar");
  assert.equal(personagem.dinheiro, 1000, "descanso bloqueado não deveria cobrar");
});

testeComBanco("saldo insuficiente recusa o descanso sem alterar HP/Mana/Gold", async () => {
  const { personagem } = await criarPersonagem({ nivel: 50 });
  personagem.vida_atual = 1;
  personagem.mana_atual = 1;
  personagem.dinheiro = 1;
  await personagem.save();

  await assert.rejects(
    () => tavernRestService.confirmarDescanso(personagem.id),
    (erro) => {
      assert.equal(erro.statusCode, 400);
      return true;
    },
  );

  await personagem.reload();
  assert.equal(personagem.vida_atual, 1);
  assert.equal(personagem.dinheiro, 1);
});

testeComBanco("duas confirmações concorrentes nunca cobram/curam em dobro", async () => {
  const { personagem } = await criarPersonagem({ nivel: 8 });
  personagem.vida_atual = 1;
  personagem.mana_atual = 1;
  personagem.dinheiro = 1000;
  await personagem.save();

  const saldoAntes = personagem.dinheiro;
  const [r1, r2] = await Promise.all([
    tavernRestService.confirmarDescanso(personagem.id),
    tavernRestService.confirmarDescanso(personagem.id),
  ]);

  await personagem.reload();
  // A primeira transaction a commitar cobra o custo cheio; a segunda,
  // rodando DEPOIS (serializada pelo row lock), já encontra HP/Mana
  // cheios e cobra 0 — nunca as duas cobram o valor cheio.
  const custoTotalCobrado = saldoAntes - personagem.dinheiro;
  assert.equal(custoTotalCobrado, Math.max(r1.custo_pago, r2.custo_pago));
  assert.equal(personagem.vida_atual, r1.vida_maxima);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
