// Evento "O Coração da Máquina Celestial" — Fase 6 (Hidráulica).
// Testes PUROS (sem banco) do domínio hidráulico sobre o engine da
// Fase 2. Inclui a fixture canônica da "Sala das Marés" com sua
// GOLDEN SOLUTION mantida só aqui (teste server-side), nunca em
// frontend/DTO público.
const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../src/services/puzzleEngineCore");
const { criarRegistryHidraulico, criarContextoHidraulico, validarTopologia } = require("../src/services/puzzleHydraulicComponents");

// Fixture canônica: Pump(100) → [Pipe(limite 60) → Valve → PressureNode(x2)
// → Turbine(alvo 60)] + [direto pro Reservoir(capacidade 80), sem
// gating — transborda assim que a bomba liga, igual ao padrão
// "receiver2 sem gating" das Fases 3/5].
function configSalaDasMares() {
  return {
    components: [
      { id: "pump1", type: "PUMP", props: { vazaoNominal: 100 } },
      { id: "pipe1", type: "PIPE", props: { vazaoMaxima: 60 } },
      { id: "valve1", type: "VALVE", props: {} },
      { id: "pressure1", type: "PRESSURE_NODE", props: { fatorPressao: 2 } },
      { id: "turbine1", type: "TURBINE", props: { vazaoAlvo: 60, toleranciaVazao: 0 } },
      { id: "reservoir1", type: "RESERVOIR", props: { capacidade: 80 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "pump1", port: "out" }, to: { componentId: "pipe1", port: "in" } },
      { id: "c2", from: { componentId: "pipe1", port: "out" }, to: { componentId: "valve1", port: "in" } },
      { id: "c3", from: { componentId: "valve1", port: "out" }, to: { componentId: "pressure1", port: "in" } },
      { id: "c4", from: { componentId: "pressure1", port: "out" }, to: { componentId: "turbine1", port: "in" } },
      { id: "c5", from: { componentId: "pump1", port: "out2" }, to: { componentId: "reservoir1", port: "in" } },
    ],
    objectives: [
      { id: "obj_turbina", descricao: "Atingir a vazão alvo da turbina", condicao: { op: "EQUALS", path: "components.turbine1.atingido", value: true } },
      { id: "obj_transbordamento", descricao: "Transbordar o reservatório", condicao: { op: "EQUALS", path: "components.reservoir1.transbordando", value: true } },
    ],
  };
}

const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "pump1" },
  { type: "ABRIR", componentId: "valve1" },
];

function resolverComGoldenSolution() {
  const contexto = criarContextoHidraulico(configSalaDasMares(), "seed-sala-das-mares");
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
test("Sala das Marés: golden solution atinge a turbina e transborda o reservatório", () => {
  const { estado, eventos } = resolverComGoldenSolution();
  assert.equal(estado.components.turbine1.atingido, true);
  assert.equal(estado.components.turbine1.vazao, 60);
  assert.equal(estado.components.reservoir1.transbordando, true);
  assert.equal(estado.components.reservoir1.nivel, 80);
  assert.deepEqual(new Set(estado.objetivosConcluidos), new Set(["obj_turbina", "obj_transbordamento"]));
  assert.ok(eventos.some((e) => e.tipo === "OBJETIVO_CONCLUIDO" && e.objetivoId === "obj_turbina"));
});

test("DETERMINISMO hidráulico: duas resoluções independentes da golden solution convergem pro mesmo state final", () => {
  const execucaoA = resolverComGoldenSolution();
  const execucaoB = resolverComGoldenSolution();
  assert.deepEqual(execucaoA.estado, execucaoB.estado);
  assert.deepEqual(execucaoA.eventos, execucaoB.eventos);
});

test("PIPE nunca deixa passar mais que vazaoMaxima; fica sobrecarregado quando a entrada excede o limite", () => {
  const contexto = criarContextoHidraulico(configSalaDasMares(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "pump1" }).state;
  assert.equal(estado.components.pipe1.vazao, 60); // limitado, não 100
  assert.equal(estado.components.pipe1.sobrecarregado, true);
});

test("RESERVOIR: nivel nunca passa de capacidade; transbordando reflete o excesso", () => {
  const contexto = criarContextoHidraulico(configSalaDasMares(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "pump1" }).state;
  assert.equal(estado.components.reservoir1.nivel, 80); // limitado, não 100
  assert.equal(estado.components.reservoir1.transbordando, true);

  estado = engine.executarAcao(contexto, estado, { type: "DESLIGAR", componentId: "pump1" }).state;
  assert.equal(estado.components.reservoir1.nivel, 0);
  assert.equal(estado.components.reservoir1.transbordando, false); // recalculado do zero, não-sticky
});

test("VALVE fechada corta a transmissão (0 vazão) dali pra frente; ABRIR libera", () => {
  const contexto = criarContextoHidraulico(configSalaDasMares(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "pump1" }).state;
  assert.equal(estado.components.valve1.vazao, 0);
  assert.equal(estado.components.pressure1.vazao, 0);
  assert.equal(estado.components.pressure1.pressao, 0);
  assert.equal(estado.components.turbine1.atingido, false);

  estado = engine.executarAcao(contexto, estado, { type: "ABRIR", componentId: "valve1" }).state;
  assert.equal(estado.components.valve1.vazao, 60);
  assert.equal(estado.components.turbine1.atingido, true);

  estado = engine.executarAcao(contexto, estado, { type: "FECHAR", componentId: "valve1" }).state;
  assert.equal(estado.components.valve1.vazao, 0);
  assert.equal(estado.components.turbine1.atingido, false);
});

test("PRESSURE_NODE deriva pressao = vazao * fatorPressao e NUNCA bloqueia (sempre repassa a vazão)", () => {
  const { estado } = resolverComGoldenSolution();
  assert.equal(estado.components.pressure1.vazao, 60);
  assert.equal(estado.components.pressure1.pressao, 120); // 60 * 2
});

test("objetivo 'obj_turbina' é sticky: fechar a válvula depois de concluído não remove da lista", () => {
  const contexto = criarContextoHidraulico(configSalaDasMares(), "seed-sticky");
  let estado = engine.construirEstadoInicial(contexto);
  for (const acao of GOLDEN_SOLUTION) estado = engine.executarAcao(contexto, estado, acao).state;
  assert.ok(estado.objetivosConcluidos.includes("obj_turbina"));
  estado = engine.executarAcao(contexto, estado, { type: "FECHAR", componentId: "valve1" }).state;
  assert.ok(estado.objetivosConcluidos.includes("obj_turbina")); // continua concluído
  assert.equal(estado.components.turbine1.atingido, false); // mas a condição "ao vivo" já não bate mais
});

test("validarTopologia: aceita a Sala das Marés e rejeita um ciclo PIPE→VALVE→PRESSURE_NODE→PIPE", () => {
  assert.doesNotThrow(() => validarTopologia(configSalaDasMares()));
  const configComCiclo = {
    components: [
      { id: "p1", type: "PIPE", props: { vazaoMaxima: 10 } },
      { id: "v1", type: "VALVE", props: {} },
      { id: "pn1", type: "PRESSURE_NODE", props: { fatorPressao: 1 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "p1", port: "a" }, to: { componentId: "v1", port: "a" } },
      { id: "c2", from: { componentId: "v1", port: "b" }, to: { componentId: "pn1", port: "a" } },
      { id: "c3", from: { componentId: "pn1", port: "b" }, to: { componentId: "p1", port: "b" } },
    ],
  };
  assert.throws(() => validarTopologia(configComCiclo), (e) => e.code === "TOPOLOGIA_CICLO");
});

test("runtime: duas fontes (PUMP) convergindo no mesmo componente é inválido mesmo quando validarTopologia (estrutural) não pega", () => {
  const config = {
    components: [
      { id: "pump1", type: "PUMP", props: { vazaoNominal: 50 } },
      { id: "pump2", type: "PUMP", props: { vazaoNominal: 30 } },
      { id: "pipeX", type: "PIPE", props: { vazaoMaxima: 100 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "pump1", port: "out" }, to: { componentId: "pipeX", port: "in" } },
      { id: "c2", from: { componentId: "pump2", port: "out" }, to: { componentId: "pipeX", port: "in" } },
    ],
  };
  assert.doesNotThrow(() => validarTopologia(config));
  const contexto = criarContextoHidraulico(config, "seed-conflito");
  assert.throws(
    () => engine.construirEstadoInicial(contexto),
    (e) => e.code === "TOPOLOGIA_CICLO" && e.statusCode === 409,
  );
});

test("registry hidráulico: validação de props recusa configuração inválida do Admin", () => {
  const registry = criarRegistryHidraulico();
  assert.throws(() => registry.obter("PUMP").validarProps({ vazaoNominal: -1 }), /positivo/);
  assert.throws(() => registry.obter("PIPE").validarProps({ vazaoMaxima: 0 }), /positivo/);
  assert.throws(() => registry.obter("PRESSURE_NODE").validarProps({ fatorPressao: 0 }), /positivo/);
  assert.throws(() => registry.obter("RESERVOIR").validarProps({ capacidade: -5 }), /positivo/);
  assert.throws(() => registry.obter("TURBINE").validarProps({ vazaoAlvo: -1 }), />= 0/);
  assert.doesNotThrow(() => registry.obter("TURBINE").validarProps({ vazaoAlvo: 0 }));
});

test("feedbackPublico hidráulico nunca expõe mais do que ligada/vazao/sobrecarregado/vazaoMaxima/aberta/pressao/nivel/transbordando/capacidade/atingido", () => {
  const { estado } = resolverComGoldenSolution();
  const chavesPermitidas = new Set(["ligada", "vazao", "sobrecarregado", "vazaoMaxima", "aberta", "pressao", "nivel", "transbordando", "capacidade", "atingido"]);
  for (const feedback of Object.values(estado.public.components)) {
    for (const chave of Object.keys(feedback)) {
      assert.ok(chavesPermitidas.has(chave), `chave inesperada no feedback público: ${chave}`);
    }
  }
});
