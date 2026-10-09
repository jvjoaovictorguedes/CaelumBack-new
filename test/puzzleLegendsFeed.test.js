// Evento "O Coração da Máquina Celestial" — Fase 11 (Hall das Lendas —
// Grandes Descobertas). Cobre puzzlePioneerService.obterFeedDeDescobertas:
// ordem cronológica (mais recente primeiro), cruza vários blueprints do
// MESMO evento, respeita o limite, e nunca mistura dados de um evento
// diferente.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzlePioneerService = require("../src/services/puzzlePioneerService");

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

function slug() {
  return sufixo().replace(/_/g, "-");
}

async function criarEventoComBlueprint(transaction) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` }, transaction);
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED", transaction);
  const { blueprint } = await puzzleBlueprintService.criarBlueprint(
    definicao.id,
    { key: `puzzle-${chave}`, nome: `Puzzle ${chave}` },
    transaction,
  );
  return { definicao, blueprint };
}

testeComBanco("obterFeedDeDescobertas: ordem cronológica (mais recente primeiro), cruzando blueprints do mesmo evento", async () => {
  const { definicao, blueprint: blueprintA } = await sequelize.transaction((t) => criarEventoComBlueprint(t));
  const { blueprint: blueprintB } = await sequelize.transaction((t) =>
    puzzleBlueprintService.criarBlueprint(definicao.id, { key: `puzzle-b-${slug()}`, nome: "Puzzle B" }, t),
  );

  const marcoA = await puzzlePioneerService.criarMilestone(blueprintA.id, {
    key: "marco-a",
    titulo: "Descoberta A",
    descricao: "Desc A",
    triggerType: "INSTANCE_COMPLETED",
  });
  const marcoB = await puzzlePioneerService.criarMilestone(blueprintB.id, {
    key: "marco-b",
    titulo: "Descoberta B",
    descricao: "Desc B",
    triggerType: "INSTANCE_COMPLETED",
  });

  const { personagem: p1 } = await criarPersonagem({ nivel: 5 });
  const { personagem: p2 } = await criarPersonagem({ nivel: 5 });

  await puzzlePioneerService.sincronizarConquistas({
    idPersonagem: p1.id,
    idBlueprint: blueprintA.id,
    objetivosConcluidos: [],
    completou: true,
  });
  // pequena pausa garante claimed_at estritamente depois do primeiro
  // (timestamps de banco têm resolução real, não é só ordem de insert).
  await new Promise((resolve) => setTimeout(resolve, 20));
  await puzzlePioneerService.sincronizarConquistas({
    idPersonagem: p2.id,
    idBlueprint: blueprintB.id,
    objetivosConcluidos: [],
    completou: true,
  });

  const feed = await puzzlePioneerService.obterFeedDeDescobertas(definicao.id);
  assert.equal(feed.length, 2);
  // mais recente primeiro: p2/marcoB desbloqueou DEPOIS de p1/marcoA.
  assert.equal(feed[0].titulo, "Descoberta B");
  assert.equal(feed[0].nome, p2.nome);
  assert.equal(feed[1].titulo, "Descoberta A");
  assert.equal(feed[1].nome, p1.nome);
  assert.ok(marcoA.id && marcoB.id); // sanity — marcos realmente distintos
});

testeComBanco("obterFeedDeDescobertas: respeita o limite e nunca mistura dados de outro evento", async () => {
  const { definicao, blueprint } = await sequelize.transaction((t) => criarEventoComBlueprint(t));
  const { definicao: outroEvento, blueprint: outroBlueprint } = await sequelize.transaction((t) => criarEventoComBlueprint(t));

  await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "marco-1",
    titulo: "Marco Um",
    descricao: "D1",
    triggerType: "INSTANCE_COMPLETED",
    maxClaims: 5,
  });
  await puzzlePioneerService.criarMilestone(outroBlueprint.id, {
    key: "m-outro",
    titulo: "De Outro Evento",
    descricao: "Nunca deveria aparecer",
    triggerType: "INSTANCE_COMPLETED",
  });

  for (let i = 0; i < 3; i += 1) {
    const { personagem } = await criarPersonagem({ nivel: 5 });
    await puzzlePioneerService.sincronizarConquistas({
      idPersonagem: personagem.id,
      idBlueprint: blueprint.id,
      objetivosConcluidos: [],
      completou: true,
    });
  }
  const { personagem: personagemOutro } = await criarPersonagem({ nivel: 5 });
  await puzzlePioneerService.sincronizarConquistas({
    idPersonagem: personagemOutro.id,
    idBlueprint: outroBlueprint.id,
    objetivosConcluidos: [],
    completou: true,
  });

  const feedLimitado = await puzzlePioneerService.obterFeedDeDescobertas(definicao.id, { limite: 2 });
  assert.equal(feedLimitado.length, 2, "respeita o limite mesmo havendo mais claims disponíveis");

  const feedCompleto = await puzzlePioneerService.obterFeedDeDescobertas(definicao.id, { limite: 100 });
  assert.equal(feedCompleto.length, 3, "só os 3 claims do evento certo, nunca o do outro evento");
  assert.ok(feedCompleto.every((item) => item.titulo === "Marco Um"));

  const feedOutroEvento = await puzzlePioneerService.obterFeedDeDescobertas(outroEvento.id);
  assert.equal(feedOutroEvento.length, 1);
  assert.equal(feedOutroEvento[0].titulo, "De Outro Evento");
});
