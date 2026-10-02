// Item 6 (bug reportado: party curava vida geral de graça ao iniciar, e
// morrer dentro do grupo não bloqueava a próxima aventura solo) —
// persistirEstadoFinalDoMembro é a peça pura extraída de
// partySocket.js#finalizarBatalha, testável sem precisar de um servidor
// socket.io de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");

const { persistirEstadoFinalDoMembro, calcularPenalidadeDiferencaNivel } = require("../src/services/partyBattleService");

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

// Pedido do jogador: penalidade de XP/ouro pro grupo inteiro quando a
// DIFERENÇA DE NÍVEL DENTRO DO GRUPO (maior - menor) é grande demais
// (power-leveling), independente do nível da zona em si.
const CONFIG_PADRAO = {
  LIMIAR_DIFERENCA_NIVEL_PARTY: 10,
  REDUCAO_RECOMPENSA_POR_NIVEL_EXCEDENTE: 0.05,
  PISO_MULTIPLICADOR_RECOMPENSA: 0.2,
};

test("calcularPenalidadeDiferencaNivel: grupo de nível parecido nunca é penalizado", () => {
  const resultado = calcularPenalidadeDiferencaNivel({
    niveisDosMembros: [8, 9, 11],
    config: CONFIG_PADRAO,
  });
  assert.equal(resultado.aplicada, false);
  assert.equal(resultado.multiplicador, 1);
});

test("calcularPenalidadeDiferencaNivel: dentro da tolerância (exatamente no limiar) ainda não penaliza", () => {
  // limiar 10 = até 10 níveis de diferença tolerados sem penalidade nenhuma.
  const resultado = calcularPenalidadeDiferencaNivel({
    niveisDosMembros: [5, 15],
    config: CONFIG_PADRAO,
  });
  assert.equal(resultado.aplicada, false);
  assert.equal(resultado.multiplicador, 1);
});

test("calcularPenalidadeDiferencaNivel: um nível de diferença acima da tolerância já reduz a recompensa", () => {
  // limiar 10; diferença de 11 = 1 nível excedente.
  const resultado = calcularPenalidadeDiferencaNivel({
    niveisDosMembros: [5, 16],
    config: CONFIG_PADRAO,
  });
  assert.equal(resultado.aplicada, true);
  assert.equal(resultado.diferenca, 11);
  // 1 - 1*0.05 = 0.95
  assert.ok(Math.abs(resultado.multiplicador - 0.95) < 1e-9);
});

test("calcularPenalidadeDiferencaNivel: usa SÓ o maior e o menor nível (membro do meio não muda nada)", () => {
  const resultado = calcularPenalidadeDiferencaNivel({
    niveisDosMembros: [6, 7, 100],
    config: CONFIG_PADRAO,
  });
  assert.equal(resultado.aplicada, true);
  assert.equal(resultado.diferenca, 94);
});

test("calcularPenalidadeDiferencaNivel: nunca cai abaixo do piso configurado, mesmo com diferença gigante", () => {
  const resultado = calcularPenalidadeDiferencaNivel({
    niveisDosMembros: [1, 100],
    config: CONFIG_PADRAO,
  });
  assert.equal(resultado.aplicada, true);
  assert.equal(resultado.multiplicador, CONFIG_PADRAO.PISO_MULTIPLICADOR_RECOMPENSA);
});

test("calcularPenalidadeDiferencaNivel: sem membros (ou só 1), não aplica nada (defensivo)", () => {
  assert.equal(calcularPenalidadeDiferencaNivel({ niveisDosMembros: [], config: CONFIG_PADRAO }).aplicada, false);
  assert.equal(calcularPenalidadeDiferencaNivel({ niveisDosMembros: [42], config: CONFIG_PADRAO }).aplicada, false);
});
