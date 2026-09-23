// Item 6 (bug reportado: party curava vida geral de graça ao iniciar, e
// morrer dentro do grupo não bloqueava a próxima aventura solo) —
// persistirEstadoFinalDoMembro é a peça pura extraída de
// partySocket.js#finalizarBatalha, testável sem precisar de um servidor
// socket.io de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");

const { persistirEstadoFinalDoMembro } = require("../src/services/partyBattleService");

function personagemFalso(overrides = {}) {
  return {
    vida_atual: 100,
    mana_atual: 50,
    ultima_atualizacao_vida: new Date(0),
    ultima_atualizacao_mana: new Date(0),
    ...overrides,
  };
}

test("persiste a vida/mana com que o membro sobreviveu à batalha (não a máxima)", () => {
  const character = personagemFalso();
  const membro = { estado: { vida_atual: 37, mana_atual: 12 }, vidaMax: 100, manaMax: 50 };

  persistirEstadoFinalDoMembro(character, membro);

  assert.equal(character.vida_atual, 37);
  assert.equal(character.mana_atual, 12);
});

test("persiste vida_atual = 0 pra quem morreu — precisa bater com o gate de 'derrotado' do combate solo", () => {
  const character = personagemFalso();
  const membro = { estado: { vida_atual: 0, mana_atual: 5 }, vidaMax: 100, manaMax: 50 };

  persistirEstadoFinalDoMembro(character, membro);

  assert.equal(character.vida_atual, 0);
});

test("atualiza ultima_atualizacao_vida/mana ao persistir — senão o regenService recalcula errado depois", () => {
  const character = personagemFalso();
  const membro = { estado: { vida_atual: 50, mana_atual: 20 }, vidaMax: 100, manaMax: 50 };
  const antes = Date.now();

  persistirEstadoFinalDoMembro(character, membro);

  assert.ok(character.ultima_atualizacao_vida.getTime() >= antes);
  assert.ok(character.ultima_atualizacao_mana.getTime() >= antes);
});

test("nunca deixa vida/mana negativa nem acima do máximo (defensivo)", () => {
  const character = personagemFalso();
  const membro = { estado: { vida_atual: -5, mana_atual: 9999 }, vidaMax: 100, manaMax: 50 };

  persistirEstadoFinalDoMembro(character, membro);

  assert.equal(character.vida_atual, 0);
  assert.equal(character.mana_atual, 50);
});

test("sem membro (personagem não encontrado na batalha em memória), não mexe no personagem", () => {
  const character = personagemFalso({ vida_atual: 71, mana_atual: 33 });

  persistirEstadoFinalDoMembro(character, undefined);

  assert.equal(character.vida_atual, 71);
  assert.equal(character.mana_atual, 33);
});
