// Evento "O Coração da Máquina Celestial" — Fase 7 (Núcleo da
// Convergência). Testes PUROS (sem banco) combinando os três domínios
// (Fases 3/5/6) numa única câmara. A GOLDEN SOLUTION fica só aqui
// (teste server-side), nunca em DTO público/frontend.
const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../src/services/puzzleEngineCore");
const { criarContextoConvergencia, validarTopologia } = require("../src/services/puzzleConvergenceComponents");

// Fixture canônica "Núcleo da Convergência": uma miniatura de cada
// domínio (transmissão mecânica, feixe óptico, fluxo hidráulico), cada
// uma com seu próprio terminal `atingido`, mais UM objetivo composto
// que exige os três terminais atingidos AO MESMO TEMPO — não é
// fiação cruzada entre domínios (cada propagação só entende os
// próprios tipos), é uma condição declarativa AND sobre os três.
function configNucleoDaConvergencia() {
  return {
    components: [
      // Transmissão (Fase 3)
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" } },
      { id: "clutch1", type: "CLUTCH", props: {} },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 } },
      // Energia/luz (Fase 5)
      { id: "emitter1", type: "EMITTER", props: { intensidade: 40, cor: "AZUL" } },
      { id: "shutter1", type: "SHUTTER", props: {} },
      { id: "receiver1", type: "RECEIVER", props: { corAlvo: "AZUL", intensidadeAlvo: 40, toleranciaIntensidade: 0 } },
      // Hidráulica (Fase 6)
      { id: "pump1", type: "PUMP", props: { vazaoNominal: 20 } },
      { id: "valve1", type: "VALVE", props: {} },
      { id: "turbine1", type: "TURBINE", props: { vazaoAlvo: 20, toleranciaVazao: 0 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "clutch1", port: "in" } },
      { id: "c2", from: { componentId: "clutch1", port: "out" }, to: { componentId: "output1", port: "in" } },
      { id: "c3", from: { componentId: "emitter1", port: "out" }, to: { componentId: "shutter1", port: "in" } },
      { id: "c4", from: { componentId: "shutter1", port: "out" }, to: { componentId: "receiver1", port: "in" } },
      { id: "c5", from: { componentId: "pump1", port: "out" }, to: { componentId: "valve1", port: "in" } },
      { id: "c6", from: { componentId: "valve1", port: "out" }, to: { componentId: "turbine1", port: "in" } },
    ],
    objectives: [
      { id: "obj_transmissao", descricao: "Resolver a transmissão mecânica", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
      { id: "obj_energia", descricao: "Resolver o feixe de energia", condicao: { op: "EQUALS", path: "components.receiver1.atingido", value: true } },
      { id: "obj_hidraulica", descricao: "Resolver o fluxo hidráulico", condicao: { op: "EQUALS", path: "components.turbine1.atingido", value: true } },
      {
        id: "obj_convergencia",
        descricao: "Sincronizar os três sistemas ao mesmo tempo",
        condicao: {
          op: "AND",
          conditions: [
            { op: "EQUALS", path: "components.output1.atingido", value: true },
            { op: "EQUALS", path: "components.receiver1.atingido", value: true },
            { op: "EQUALS", path: "components.turbine1.atingido", value: true },
          ],
        },
      },
    ],
  };
}

const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "motor1" },
  { type: "ENGATAR", componentId: "clutch1" },
  { type: "LIGAR", componentId: "emitter1" },
  { type: "ABRIR", componentId: "shutter1" },
  { type: "LIGAR", componentId: "pump1" },
  { type: "ABRIR", componentId: "valve1" },
];

function resolverComGoldenSolution() {
  const contexto = criarContextoConvergencia(configNucleoDaConvergencia(), "seed-nucleo-convergencia");
  let estado = engine.construirEstadoInicial(contexto);
  const eventos = [];
  for (const acao of GOLDEN_SOLUTION) {
    const resultado = engine.executarAcao(contexto, estado, acao);
    estado = resultado.state;
    eventos.push(...resultado.eventos);
  }
  return { estado, eventos };
}

// ---------------------------------------------------------------------------
test("Núcleo da Convergência: golden solution resolve os três sub-sistemas e a condição composta", () => {
  const { estado, eventos } = resolverComGoldenSolution();
  assert.equal(estado.components.output1.atingido, true);
  assert.equal(estado.components.receiver1.atingido, true);
  assert.equal(estado.components.turbine1.atingido, true);
  assert.deepEqual(new Set(estado.objetivosConcluidos), new Set(["obj_transmissao", "obj_energia", "obj_hidraulica", "obj_convergencia"]));
  assert.ok(eventos.some((e) => e.tipo === "OBJETIVO_CONCLUIDO" && e.objetivoId === "obj_convergencia"));
});

test("DETERMINISMO da convergência: duas resoluções independentes da mesma golden solution convergem pro mesmo state final", () => {
  const execucaoA = resolverComGoldenSolution();
  const execucaoB = resolverComGoldenSolution();
  assert.deepEqual(execucaoA.estado, execucaoB.estado);
  assert.deepEqual(execucaoA.eventos, execucaoB.eventos);
});

test("SINCRONIZAÇÃO: obj_convergencia só conclui quando os três terminais estão atingidos NA MESMA FOTO do estado", () => {
  const contexto = criarContextoConvergencia(configNucleoDaConvergencia(), "seed-sincronizacao");
  let estado = engine.construirEstadoInicial(contexto);

  // 1) resolve só a transmissão mecânica.
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "ENGATAR", componentId: "clutch1" }).state;
  assert.equal(estado.components.output1.atingido, true);
  assert.ok(estado.objetivosConcluidos.includes("obj_transmissao"));
  assert.ok(!estado.objetivosConcluidos.includes("obj_convergencia"));

  // 2) desfaz a transmissão (desengata) ANTES de resolver os outros dois —
  // output1.atingido volta a false (não-sticky), mas obj_transmissao
  // (sticky) continua marcado como concluído historicamente.
  estado = engine.executarAcao(contexto, estado, { type: "DESENGATAR", componentId: "clutch1" }).state;
  assert.equal(estado.components.output1.atingido, false);
  assert.ok(estado.objetivosConcluidos.includes("obj_transmissao")); // sticky: não desconclui

  // 3) resolve óptico e hidráulico com a transmissão AINDA desfeita.
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "emitter1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "ABRIR", componentId: "shutter1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "pump1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "ABRIR", componentId: "valve1" }).state;
  assert.equal(estado.components.receiver1.atingido, true);
  assert.equal(estado.components.turbine1.atingido, true);
  assert.equal(estado.components.output1.atingido, false); // ainda desfeita
  // os três NUNCA estiveram atingidos ao mesmo tempo até aqui — a
  // convergência não pode ter concluído.
  assert.ok(!estado.objetivosConcluidos.includes("obj_convergencia"));

  // 4) só agora, reengatando a transmissão com os outros dois já
  // resolvidos, os três ficam atingidos NA MESMA FOTO — e aí sim a
  // convergência conclui.
  estado = engine.executarAcao(contexto, estado, { type: "ENGATAR", componentId: "clutch1" }).state;
  assert.equal(estado.components.output1.atingido, true);
  assert.equal(estado.components.receiver1.atingido, true);
  assert.equal(estado.components.turbine1.atingido, true);
  assert.ok(estado.objetivosConcluidos.includes("obj_convergencia"));
});

test("objetivos compostos nunca aceitam completed/success/solution/reward do payload do cliente — só o backend decide via condição declarativa", () => {
  const contexto = criarContextoConvergencia(configNucleoDaConvergencia(), "seed-anti-trapaca");
  let estado = engine.construirEstadoInicial(contexto);
  const resultado = engine.executarAcao(contexto, estado, {
    type: "LIGAR",
    componentId: "motor1",
    payload: { completed: true, success: true, solution: "obj_convergencia", reward: "GOLD_99999" },
  });
  // o engine ignora completamente esses campos do payload — só liga o motor.
  assert.equal(resultado.state.components.motor1.ligado, true);
  assert.deepEqual(resultado.objetivosRecemConcluidos, []);
});

test("validarTopologia: aceita o Núcleo da Convergência (os três subgrafos são válidos independentemente)", () => {
  assert.doesNotThrow(() => validarTopologia(configNucleoDaConvergencia()));
});

test("registry de convergência: reúne os tipos dos três domínios sem reimplementar nenhum", () => {
  const { criarRegistryConvergencia } = require("../src/services/puzzleConvergenceComponents");
  const registry = criarRegistryConvergencia();
  for (const tipo of ["MOTOR", "GEAR", "CLUTCH", "OUTPUT", "EMITTER", "PRISM", "RECEIVER", "PUMP", "VALVE", "TURBINE"]) {
    assert.ok(registry.possui(tipo), `registry de convergência deveria conhecer o tipo ${tipo}`);
  }
});

test("feedbackPublico da convergência nunca vaza segredo — cada tipo expõe exatamente o mesmo shape do domínio original", () => {
  const { estado } = resolverComGoldenSolution();
  const chavesPermitidas = new Set([
    "ligado",
    "rpm",
    "sentido",
    "engatada",
    "atingido",
    "intensidade",
    "cor",
    "aberto",
    "ligada",
    "vazao",
    "aberta",
  ]);
  for (const feedback of Object.values(estado.public.components)) {
    for (const chave of Object.keys(feedback)) {
      assert.ok(chavesPermitidas.has(chave), `chave inesperada no feedback público: ${chave}`);
    }
  }
});
