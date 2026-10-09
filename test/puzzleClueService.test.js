// Evento "O Coração da Máquina Celestial" — Fase 9 (Sistema de pistas e
// Caderno de Investigação). Cobre: validação do catálogo admin
// (criarDefinicao), sincronização idempotente de desbloqueio a partir
// de estado já persistido (nunca de um evento transiente), os dois
// tipos de gatilho (OBJECTIVE_COMPLETED/INSTANCE_COMPLETED), o DTO do
// Caderno (pistas bloqueadas nunca vazam título/texto) e integração
// ponta-a-ponta com o pipeline real de ações da Fase 8.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const { CharacterClueUnlock } = require("../src/models/eventPuzzleModels");

const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");
const puzzleActionService = require("../src/services/puzzleActionService");
const puzzleClueService = require("../src/services/puzzleClueService");

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

// Mesma fixture canônica da Fase 8 (Câmara das Engrenagens) — 2
// objetivos independentes, ótima pra testar os 2 tipos de gatilho de
// pista ao mesmo tempo.
function configCamaraDasEngrenagens() {
  return {
    dominio: "MECANICO",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 120, sentido: "CW" } },
      { id: "gear1", type: "GEAR", props: { dentes: 20 } },
      { id: "gear2", type: "GEAR", props: { dentes: 40 } },
      { id: "clutch1", type: "CLUTCH", props: {} },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CCW", toleranciaRpm: 0 } },
      { id: "lever1", type: "LEVER", props: {} },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "gear1", port: "in" } },
      { id: "c2", from: { componentId: "gear1", port: "out" }, to: { componentId: "gear2", port: "in" } },
      { id: "c3", from: { componentId: "gear2", port: "out" }, to: { componentId: "clutch1", port: "in" } },
      { id: "c4", from: { componentId: "clutch1", port: "out" }, to: { componentId: "output1", port: "in" } },
    ],
    objectives: [
      { id: "obj_rotacao", descricao: "Atingir a rotação de saída", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
      { id: "obj_alavanca", descricao: "Acionar a alavanca cerimonial", condicao: { op: "EQUALS", path: "components.lever1.acionada", value: true } },
    ],
  };
}

const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "motor1" },
  { type: "ENGATAR", componentId: "clutch1" },
  { type: "ACIONAR", componentId: "lever1" },
];

async function criarFundacaoComDominio(config, transaction) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` }, transaction);
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED", transaction);

  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: `Edição ${chave}` }, transaction);
  await eventEditionService.transicionar(edicao.id, "ACTIVE", transaction);

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(
    definicao.id,
    { key: `puzzle-${chave}`, nome: `Puzzle ${chave}` },
    transaction,
  );
  await puzzleBlueprintService.atualizarDraft(versao.id, { config }, transaction);
  const versaoPublicada = await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {}, transaction);

  return { definicao, edicao, blueprint, versao: versaoPublicada };
}

// ---------------------------------------------------------------------
// 1. Catálogo admin — validações
// ---------------------------------------------------------------------

testeComBanco("criarDefinicao: exige objectiveId quando OBJECTIVE_COMPLETED, proíbe quando INSTANCE_COMPLETED", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));

  await assert.rejects(
    () =>
      puzzleClueService.criarDefinicao(blueprint.id, {
        key: "pista-1",
        titulo: "Pista 1",
        texto: "Texto 1",
        triggerType: "OBJECTIVE_COMPLETED",
      }),
    (e) => e.statusCode === 400,
  );

  await assert.rejects(
    () =>
      puzzleClueService.criarDefinicao(blueprint.id, {
        key: "pista-2",
        titulo: "Pista 2",
        texto: "Texto 2",
        triggerType: "INSTANCE_COMPLETED",
        objectiveId: "obj_x",
      }),
    (e) => e.statusCode === 400,
  );

  const ok = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-3",
    titulo: "Pista 3",
    texto: "Texto 3",
    triggerType: "INSTANCE_COMPLETED",
  });
  assert.equal(ok.trigger_type, "INSTANCE_COMPLETED");
  assert.equal(ok.objective_id, null);
});

testeComBanco("criarDefinicao: key duplicada no MESMO blueprint rejeita com 409", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "duplicada",
    titulo: "Título A",
    texto: "Texto A",
    triggerType: "INSTANCE_COMPLETED",
  });
  await assert.rejects(
    () =>
      puzzleClueService.criarDefinicao(blueprint.id, {
        key: "duplicada",
        titulo: "Título B",
        texto: "Texto B",
        triggerType: "INSTANCE_COMPLETED",
      }),
    (e) => e.statusCode === 409,
  );
});

// ---------------------------------------------------------------------
// 2. sincronizarDesbloqueios — idempotência e os 2 tipos de gatilho
// ---------------------------------------------------------------------

testeComBanco("sincronizarDesbloqueios: OBJECTIVE_COMPLETED só dispara quando o id está em objetivosConcluidos", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const pista = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-rotacao",
    titulo: "A Rotação Certa",
    texto: "Segredo revelado só depois de obj_rotacao.",
    triggerType: "OBJECTIVE_COMPLETED",
    objectiveId: "obj_rotacao",
  });

  const semObjetivo = await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: [],
    completou: false,
  });
  assert.deepEqual(semObjetivo, []);

  const comObjetivoErrado = await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: ["obj_outro"],
    completou: false,
  });
  assert.deepEqual(comObjetivoErrado, []);

  const comObjetivoCerto = await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: ["obj_rotacao"],
    completou: false,
  });
  assert.equal(comObjetivoCerto.length, 1);
  assert.equal(comObjetivoCerto[0].id, pista.id);
});

testeComBanco("sincronizarDesbloqueios: INSTANCE_COMPLETED só dispara com completou=true, nunca por objetivo sozinho", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const pista = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-final",
    titulo: "O Segredo Final",
    texto: "Só depois do puzzle inteiro resolvido.",
    triggerType: "INSTANCE_COMPLETED",
  });

  const comObjetivosMasNaoCompleto = await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: ["obj_rotacao", "obj_alavanca"],
    completou: false,
  });
  assert.deepEqual(comObjetivosMasNaoCompleto, []);

  const completo = await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: ["obj_rotacao", "obj_alavanca"],
    completou: true,
  });
  assert.equal(completo.length, 1);
  assert.equal(completo[0].id, pista.id);
});

testeComBanco("sincronizarDesbloqueios: reavaliar o MESMO estado 2x nunca duplica (idempotência real no banco)", async () => {
  const { blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const pista = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-unica",
    titulo: "Única",
    texto: "Texto.",
    triggerType: "OBJECTIVE_COMPLETED",
    objectiveId: "obj_rotacao",
  });

  const payload = {
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: ["obj_rotacao"],
    completou: false,
  };
  const primeira = await puzzleClueService.sincronizarDesbloqueios(payload);
  assert.equal(primeira.length, 1);
  const segunda = await puzzleClueService.sincronizarDesbloqueios(payload);
  assert.deepEqual(segunda, [], "a 2ª sincronização não reporta nada como 'novo' — já estava desbloqueada");
  const terceira = await puzzleClueService.sincronizarDesbloqueios(payload);
  assert.deepEqual(terceira, []);

  const linhas = await CharacterClueUnlock.count({
    where: { id_personagem: personagem.id, id_clue_definition: pista.id },
  });
  assert.equal(linhas, 1, "nunca mais de 1 linha de desbloqueio pro mesmo personagem+pista");
});

// ---------------------------------------------------------------------
// 3. obterCaderno — DTO nunca vaza conteúdo de pista bloqueada
// ---------------------------------------------------------------------

testeComBanco("obterCaderno: pista bloqueada só {id,bloqueada:true} — nunca titulo/texto/trigger", async () => {
  const { definicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio({ dominio: "MECANICO", components: [] }, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const bloqueada = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-bloqueada",
    titulo: "SPOILER — nunca deveria aparecer",
    texto: "SEGREDO — nunca deveria aparecer",
    triggerType: "OBJECTIVE_COMPLETED",
    objectiveId: "obj_rotacao",
  });
  const desbloqueada = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-desbloqueada",
    titulo: "Título OK",
    texto: "Texto OK",
    triggerType: "INSTANCE_COMPLETED",
  });
  await puzzleClueService.sincronizarDesbloqueios({
    idPersonagem: personagem.id,
    idBlueprint: blueprint.id,
    objetivosConcluidos: [],
    completou: true,
  });

  const caderno = await puzzleClueService.obterCaderno(personagem.id, definicao.id);
  const serializado = JSON.stringify(caderno);
  assert.ok(!serializado.includes("SPOILER"), "título de pista bloqueada nunca serializa no DTO");
  assert.ok(!serializado.includes("SEGREDO"), "texto de pista bloqueada nunca serializa no DTO");
  assert.ok(!serializado.includes("OBJECTIVE_COMPLETED"), "trigger_type nunca vaza no DTO do jogador");
  assert.ok(!serializado.includes("obj_rotacao"), "objective_id (condição de desbloqueio) nunca vaza");

  const entradaBloqueada = caderno.find((c) => c.id === bloqueada.id);
  assert.deepEqual(entradaBloqueada, { id: bloqueada.id, bloqueada: true });

  const entradaDesbloqueada = caderno.find((c) => c.id === desbloqueada.id);
  assert.equal(entradaDesbloqueada.bloqueada, false);
  assert.equal(entradaDesbloqueada.titulo, "Título OK");
  assert.equal(entradaDesbloqueada.texto, "Texto OK");
  assert.ok(entradaDesbloqueada.unlockedAt);
});

// ---------------------------------------------------------------------
// 4. Integração ponta-a-ponta com o pipeline real de ações (Fase 8)
// ---------------------------------------------------------------------

testeComBanco("integração: golden solution real desbloqueia as pistas certas nas ações certas, nunca antes", async () => {
  const config = configCamaraDasEngrenagens();
  const { definicao, edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const pistaRotacao = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-rotacao",
    titulo: "A Engrenagem Fala",
    texto: "Você percebeu o padrão da rotação.",
    triggerType: "OBJECTIVE_COMPLETED",
    objectiveId: "obj_rotacao",
  });
  const pistaFinal = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-final",
    titulo: "O Mecanismo Completo",
    texto: "A máquina revela seu último segredo.",
    triggerType: "INSTANCE_COMPLETED",
  });

  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });

  // caderno começa 100% bloqueado.
  const cadernoInicial = await puzzleClueService.obterCaderno(personagem.id, definicao.id);
  assert.ok(cadernoInicial.every((c) => c.bloqueada === true));

  let versaoEsperada = 0;
  const resultadosPorAcao = [];
  for (const acao of GOLDEN_SOLUTION) {
    const { pistasDesbloqueadas } = await puzzleActionService.executarAcao(instancia.id, personagem.id, acao, versaoEsperada);
    versaoEsperada += 1;
    resultadosPorAcao.push({ acao, pistasDesbloqueadas });
  }

  // LIGAR motor1: nenhum objetivo bate ainda.
  assert.deepEqual(resultadosPorAcao[0].pistasDesbloqueadas, []);
  // ENGATAR clutch1: fecha obj_rotacao (mas não obj_alavanca) — só a
  // pista de rotação desbloqueia aqui, a final ainda não (puzzle não
  // completou, falta obj_alavanca).
  assert.equal(resultadosPorAcao[1].pistasDesbloqueadas.length, 1);
  assert.equal(resultadosPorAcao[1].pistasDesbloqueadas[0].id, pistaRotacao.id);
  // ACIONAR lever1: fecha obj_alavanca E completa o puzzle inteiro — a
  // pista final (INSTANCE_COMPLETED) desbloqueia exatamente aqui.
  assert.equal(resultadosPorAcao[2].pistasDesbloqueadas.length, 1);
  assert.equal(resultadosPorAcao[2].pistasDesbloqueadas[0].id, pistaFinal.id);

  const cadernoFinal = await puzzleClueService.obterCaderno(personagem.id, definicao.id);
  assert.ok(cadernoFinal.every((c) => c.bloqueada === false), "as 2 pistas estão desbloqueadas no fim");
  const titulos = new Set(cadernoFinal.map((c) => c.titulo));
  assert.ok(titulos.has("A Engrenagem Fala"));
  assert.ok(titulos.has("O Mecanismo Completo"));
});
