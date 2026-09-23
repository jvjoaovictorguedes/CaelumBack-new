// Expansão Aventura Beta §35 — Maestria Regional nunca regride quando o
// catálogo de uma área cresce (CharacterZoneMasteryFloor).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const CharacterZoneMasteryFloor = require("../src/models/CharacterZoneMasteryFloor");
const AdventureZone = require("../src/models/AdventureZone");
const { calcularMaestriaDaRegiao } = require("../src/services/masteryService");

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

testeComBanco("piso salvo garante que o nível de Maestria nunca fica abaixo dele, mesmo sem bater o roster atual", async () => {
  const { personagem } = await criarPersonagem({ nivel: 20 });
  const zona = await AdventureZone.findOne({ where: { nome: "Bosque de Sussurros" } });

  await CharacterZoneMasteryFloor.create({ id_personagem: personagem.id, id_area: zona.id, nivel_piso: 3 });

  // Esse personagem nunca matou nada no Bosque de Sussurros (bestiário
  // vazio) — sem o piso, calcularMaestriaDaRegiao devolveria nível 0.
  const { nivel } = await calcularMaestriaDaRegiao(personagem.id, zona.id);
  assert.equal(nivel, 3, "piso não foi respeitado — Maestria regrediu abaixo do que já tinha sido conquistado");
});

testeComBanco("sem piso salvo, comportamento continua igual (regressão)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 20 });
  const zona = await AdventureZone.findOne({ where: { nome: "Bosque de Sussurros" } });

  const { nivel } = await calcularMaestriaDaRegiao(personagem.id, zona.id);
  assert.equal(nivel, 0);
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
