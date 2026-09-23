// Item 6 (bug reportado: iniciar uma party curava a vida geral de graça,
// mesmo quem já estava machucado) — carregarLutador(id, { vidaCheia })
// precisa continuar entrando com vida/mana cheia por padrão (Duelo/
// Ranqueado/Torneio, regressão) mas respeitar a vida/mana REAL quando
// vidaCheia:false (Party).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const { carregarLutador } = require("../src/socket/pvpLiveSocket");

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

testeComBanco("sem opções (padrão), carrega com vida/mana no MÁXIMO — regressão de Duelo/Ranqueado/Torneio", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  personagem.vida_atual = 1;
  personagem.mana_atual = 1;
  await personagem.save();

  const lutador = await carregarLutador(personagem.id);

  assert.equal(lutador.estado.vida_atual, lutador.vidaMax);
  assert.equal(lutador.estado.mana_atual, lutador.manaMax);
  assert.ok(lutador.vidaMax > 1);
});

testeComBanco("com vidaCheia:false, carrega com a vida/mana REAL do banco — usado pela Party", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  personagem.vida_atual = 23;
  personagem.mana_atual = 7;
  await personagem.save();

  const lutador = await carregarLutador(personagem.id, { vidaCheia: false });

  assert.equal(lutador.estado.vida_atual, 23);
  assert.equal(lutador.estado.mana_atual, 7);
  assert.ok(lutador.vidaMax > 23, "vidaMax devia continuar sendo o máximo de verdade, só o vida_atual muda");
});

testeComBanco("com vidaCheia:false e vida_atual = 0 (derrotado), continua carregando com 0 — não ressuscita ninguém", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  personagem.vida_atual = 0;
  personagem.mana_atual = 0;
  await personagem.save();

  const lutador = await carregarLutador(personagem.id, { vidaCheia: false });

  assert.equal(lutador.estado.vida_atual, 0);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
