// Evento "O Coração da Máquina Celestial" — Fase 3 (Sistema Mecânico).
// Testes PUROS (sem banco) do domínio mecânico sobre o engine da Fase
// 2. Inclui a fixture canônica da "Câmara das Engrenagens" com sua
// GOLDEN SOLUTION — a sequência de ações que resolve o puzzle mantida
// SÓ aqui (teste server-side), nunca em código de frontend/DTO público
// (regra explícita da encomenda: "golden solution fica somente
// server-side/Admin").
const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../src/services/puzzleEngineCore");
const {
  criarRegistryMecanico,
  criarContextoMecanico,
  validarTopologia,
} = require("../src/services/puzzleMechanicalComponents");

// Fixture canônica: Motor → Gear(20) → Gear(40) [engrenando, inverte+
// reduz à metade] → Clutch → Output(alvo 60 CCW). + uma Lever solta,
// só pra exercitar o tipo e um segundo objetivo independente.
function configCamaraDasEngrenagens() {
  return {
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

// GOLDEN SOLUTION — nunca exposta a cliente/DTO, só usada aqui pra
// provar que o puzzle é resolvível deterministicamente pelo servidor.
const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "motor1" },
  { type: "ENGATAR", componentId: "clutch1" },
  { type: "ACIONAR", componentId: "lever1" },
];

function resolverComGoldenSolution() {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-camara-das-engrenagens");
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
test("Câmara das Engrenagens: golden solution resolve os dois objetivos deterministicamente", () => {
  const { estado, eventos } = resolverComGoldenSolution();
  assert.equal(estado.components.output1.atingido, true);
  assert.deepEqual(new Set(estado.objetivosConcluidos), new Set(["obj_rotacao", "obj_alavanca"]));
  assert.ok(eventos.some((e) => e.tipo === "OBJETIVO_CONCLUIDO" && e.objetivoId === "obj_rotacao"));
  assert.ok(eventos.some((e) => e.tipo === "OBJETIVO_CONCLUIDO" && e.objetivoId === "obj_alavanca"));
});

test("DETERMINISMO mecânico: duas resoluções independentes da golden solution convergem pro mesmo state final", () => {
  const execucaoA = resolverComGoldenSolution();
  const execucaoB = resolverComGoldenSolution();
  assert.deepEqual(execucaoA.estado, execucaoB.estado);
  assert.deepEqual(execucaoA.eventos, execucaoB.eventos);
});

test("GEAR→GEAR inverte sentido e escala por razão de dentes; acoplamento direto numa GEAR não inverte", () => {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;

  // motor1 (CW, 120) -> gear1: acoplamento direto (motor não é GEAR), 1:1, sem inverter
  assert.equal(estado.components.gear1.rpm, 120);
  assert.equal(estado.components.gear1.sentido, "CW");

  // gear1 -> gear2: GEAR→GEAR, ratio 20/40 = 0.5, inverte sentido
  assert.equal(estado.components.gear2.rpm, 60);
  assert.equal(estado.components.gear2.sentido, "CCW");
});

test("CLUTCH desengatada corta a transmissão (0 rpm) dali pra frente; engatada repassa 1:1", () => {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;

  assert.equal(estado.components.clutch1.rpm, 0);
  assert.equal(estado.components.output1.rpm, 0);
  assert.equal(estado.components.output1.atingido, false);

  estado = engine.executarAcao(contexto, estado, { type: "ENGATAR", componentId: "clutch1" }).state;
  assert.equal(estado.components.clutch1.rpm, 60);
  assert.equal(estado.components.clutch1.sentido, "CCW");
  assert.equal(estado.components.output1.atingido, true);

  estado = engine.executarAcao(contexto, estado, { type: "DESENGATAR", componentId: "clutch1" }).state;
  assert.equal(estado.components.output1.rpm, 0);
  assert.equal(estado.components.output1.atingido, false); // não-sticky: condição recalcula e cai
});

test("objetivo 'obj_rotacao' é sticky: depois de concluído, desengatar a clutch não remove da lista", () => {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "ENGATAR", componentId: "clutch1" }).state;
  assert.ok(estado.objetivosConcluidos.includes("obj_rotacao"));
  estado = engine.executarAcao(contexto, estado, { type: "DESENGATAR", componentId: "clutch1" }).state;
  assert.ok(estado.objetivosConcluidos.includes("obj_rotacao")); // continua concluído
  assert.equal(estado.components.output1.atingido, false); // mas a condição "ao vivo" já não bate mais
});

test("PULLEY→PULLEY escala por razão de raio e NUNCA inverte sentido (diferente de GEAR)", () => {
  const config = {
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 100, sentido: "CW" } },
      { id: "pulley1", type: "PULLEY", props: { raio: 10 } },
      { id: "pulley2", type: "PULLEY", props: { raio: 20 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "pulley1", port: "in" } },
      { id: "c2", from: { componentId: "pulley1", port: "out" }, to: { componentId: "pulley2", port: "in" } },
    ],
  };
  const contexto = criarContextoMecanico(config, "seed-polia");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  assert.equal(estado.components.pulley1.rpm, 100);
  assert.equal(estado.components.pulley1.sentido, "CW");
  // ratio 10/20 = 0.5 -> 50 rpm, sentido PRESERVADO (correia não inverte)
  assert.equal(estado.components.pulley2.rpm, 50);
  assert.equal(estado.components.pulley2.sentido, "CW");
});

test("validarTopologia: aceita a Câmara das Engrenagens e rejeita um ciclo GEAR→GEAR→GEAR→GEAR", () => {
  assert.doesNotThrow(() => validarTopologia(configCamaraDasEngrenagens()));

  const configComCiclo = {
    components: [
      { id: "g1", type: "GEAR", props: { dentes: 10 } },
      { id: "g2", type: "GEAR", props: { dentes: 10 } },
      { id: "g3", type: "GEAR", props: { dentes: 10 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "g1", port: "a" }, to: { componentId: "g2", port: "a" } },
      { id: "c2", from: { componentId: "g2", port: "b" }, to: { componentId: "g3", port: "a" } },
      { id: "c3", from: { componentId: "g3", port: "b" }, to: { componentId: "g1", port: "b" } }, // fecha o ciclo
    ],
  };
  assert.throws(() => validarTopologia(configComCiclo), (e) => e.code === "TOPOLOGIA_CICLO");
});

test("runtime: duas fontes (MOTOR) convergindo no mesmo componente é inválido mesmo quando validarTopologia (estrutural) não pega", () => {
  const config = {
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 50, sentido: "CW" } },
      { id: "motor2", type: "MOTOR", props: { rpmNominal: 50, sentido: "CCW" } },
      { id: "gearX", type: "GEAR", props: { dentes: 10 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "gearX", port: "in" } },
      { id: "c2", from: { componentId: "motor2", port: "out" }, to: { componentId: "gearX", port: "in" } },
    ],
  };
  // estrutural: motor1-gearX-motor2 é uma árvore (sem ciclo undirected) — não lança.
  assert.doesNotThrow(() => validarTopologia(config));
  // runtime: propagação detecta a convergência de duas fontes e lança (defesa em profundidade).
  const contexto = criarContextoMecanico(config, "seed-conflito");
  assert.throws(
    () => engine.construirEstadoInicial(contexto),
    (e) => e.code === "TOPOLOGIA_CICLO" && e.statusCode === 409,
  );
});

test("registry mecânico: validação de props recusa configuração inválida do Admin", () => {
  const registry = criarRegistryMecanico();
  assert.throws(() => registry.obter("MOTOR").validarProps({ rpmNominal: -5, sentido: "CW" }), /positivo/);
  assert.throws(() => registry.obter("MOTOR").validarProps({ rpmNominal: 10, sentido: "DIAGONAL" }), /CW.*CCW|sentido/);
  assert.throws(() => registry.obter("GEAR").validarProps({ dentes: 0 }), /positivo/);
  assert.throws(() => registry.obter("OUTPUT").validarProps({ rpmAlvo: -1 }), />= 0/);
  assert.doesNotThrow(() => registry.obter("OUTPUT").validarProps({ rpmAlvo: 0 })); // saída "parada" é válida
});

test("LEVER nunca participa da propagação rotacional (não tem rpm/sentido, só controle manual)", () => {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  assert.deepEqual(estado.components.lever1, { acionada: false });
  estado = engine.executarAcao(contexto, estado, { type: "ACIONAR", componentId: "lever1" }).state;
  assert.deepEqual(estado.components.lever1, { acionada: true });
});

test("feedbackPublico mecânico nunca expõe mais do que rpm/sentido/atingido/dentes/raio/ligado/engatada/acionada", () => {
  const { estado } = resolverComGoldenSolution();
  const chavesPermitidas = new Set(["ligado", "rpm", "sentido", "dentes", "raio", "engatada", "acionada", "atingido"]);
  for (const feedback of Object.values(estado.public.components)) {
    for (const chave of Object.keys(feedback)) {
      assert.ok(chavesPermitidas.has(chave), `chave inesperada no feedback público: ${chave}`);
    }
  }
});
