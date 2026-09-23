const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const { adicionarExperiencia, PONTOS_POR_NIVEL } = require("../src/services/experienceService");

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

test("cada nível concede 4 pontos de atributo", () => {
  assert.equal(PONTOS_POR_NIVEL, 4);
});

testeComBanco("subir 1 nível dá +4 pontos para distribuir", async () => {
  const { personagem } = await criarPersonagem({ nivel: 1 });
  await personagem.update({ experiencia: 0, pontos_distribuir: 0 });

  const resultado = await adicionarExperiencia(personagem.id, 100);
  assert.equal(resultado.nivel, 2);
  assert.equal(resultado.niveisGanhos, 1);
  assert.equal(resultado.pontos_distribuir, 4);

  await personagem.reload();
  assert.equal(personagem.pontos_distribuir, 4);
});

testeComBanco("vários níveis de uma vez somam 4 pontos por nível, preservando os já acumulados", async () => {
  const { personagem } = await criarPersonagem({ nivel: 1 });
  await personagem.update({ experiencia: 0, pontos_distribuir: 2 });

  // Nível 1->2 custa 100, 2->3 custa 200, 3->4 custa 300.
  const resultado = await adicionarExperiencia(personagem.id, 600);
  assert.equal(resultado.nivel, 4);
  assert.equal(resultado.niveisGanhos, 3);
  assert.equal(resultado.pontos_distribuir, 2 + 3 * 4);
});

testeComBanco("XP que não completa o nível não concede pontos", async () => {
  const { personagem } = await criarPersonagem({ nivel: 1 });
  await personagem.update({ experiencia: 0, pontos_distribuir: 0 });

  const resultado = await adicionarExperiencia(personagem.id, 99);
  assert.equal(resultado.nivel, 1);
  assert.equal(resultado.pontos_distribuir, 0);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
