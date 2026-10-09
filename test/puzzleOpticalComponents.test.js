// Evento "O Coração da Máquina Celestial" — Fase 5 (Óptica). Testes
// PUROS (sem banco) do domínio óptico sobre o engine da Fase 2. Inclui
// a fixture canônica do "Observatório / Prisma da Aurora" com sua
// GOLDEN SOLUTION mantida só aqui (teste server-side), nunca em
// frontend/DTO público.
const test = require("node:test");
const assert = require("node:assert/strict");

const engine = require("../src/services/puzzleEngineCore");
const { criarRegistryOptico, criarContextoOptico, validarTopologia } = require("../src/services/puzzleOpticalComponents");

// Fixture canônica: Emitter(BRANCO) → Prism → [VERMELHO: Mirror → Lens
// (0.5x) → Shutter → Receiver1(alvo 50 VERMELHO)] + [VERDE: direto pro
// Receiver2(alvo 100 VERDE), sem gating].
function configObservatorio() {
  return {
    components: [
      { id: "emitter1", type: "EMITTER", props: { intensidade: 100, cor: "BRANCO" } },
      { id: "prism1", type: "PRISM", props: {} },
      { id: "mirror1", type: "MIRROR", props: {} },
      { id: "lens1", type: "LENS", props: { fator: 0.5 } },
      { id: "shutter1", type: "SHUTTER", props: {} },
      { id: "receiver1", type: "RECEIVER", props: { corAlvo: "VERMELHO", intensidadeAlvo: 50, toleranciaIntensidade: 0 } },
      { id: "receiver2", type: "RECEIVER", props: { corAlvo: "VERDE", intensidadeAlvo: 100, toleranciaIntensidade: 0 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "emitter1", port: "out" }, to: { componentId: "prism1", port: "in" } },
      { id: "c2", from: { componentId: "prism1", port: "VERMELHO" }, to: { componentId: "mirror1", port: "in" } },
      { id: "c3", from: { componentId: "mirror1", port: "out" }, to: { componentId: "lens1", port: "in" } },
      { id: "c4", from: { componentId: "lens1", port: "out" }, to: { componentId: "shutter1", port: "in" } },
      { id: "c5", from: { componentId: "shutter1", port: "out" }, to: { componentId: "receiver1", port: "in" } },
      { id: "c6", from: { componentId: "prism1", port: "VERDE" }, to: { componentId: "receiver2", port: "in" } },
    ],
    objectives: [
      { id: "obj_vermelho", descricao: "Focar o feixe vermelho no receptor", condicao: { op: "EQUALS", path: "components.receiver1.atingido", value: true } },
      { id: "obj_verde", descricao: "Canal verde do prisma atingido", condicao: { op: "EQUALS", path: "components.receiver2.atingido", value: true } },
    ],
  };
}

const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "emitter1" },
  { type: "ABRIR", componentId: "shutter1" },
];

function resolverComGoldenSolution() {
  const contexto = criarContextoOptico(configObservatorio(), "seed-observatorio");
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
test("Observatório: golden solution atinge os dois receptores (fan-out BRANCO + gating)", () => {
  const { estado, eventos } = resolverComGoldenSolution();
  assert.equal(estado.components.receiver1.atingido, true);
  assert.equal(estado.components.receiver1.intensidade, 50);
  assert.equal(estado.components.receiver1.cor, "VERMELHO");
  assert.equal(estado.components.receiver2.atingido, true);
  assert.equal(estado.components.receiver2.intensidade, 100);
  assert.equal(estado.components.receiver2.cor, "VERDE");
  assert.deepEqual(new Set(estado.objetivosConcluidos), new Set(["obj_vermelho", "obj_verde"]));
  assert.ok(eventos.some((e) => e.tipo === "OBJETIVO_CONCLUIDO" && e.objetivoId === "obj_vermelho"));
});

test("DETERMINISMO óptico: duas resoluções independentes da golden solution convergem pro mesmo state final", () => {
  const execucaoA = resolverComGoldenSolution();
  const execucaoB = resolverComGoldenSolution();
  assert.deepEqual(execucaoA.estado, execucaoB.estado);
  assert.deepEqual(execucaoA.eventos, execucaoB.eventos);
});

test("PRISM com luz BRANCA: fan-out emite em TODAS as portas na mesma intensidade recebida", () => {
  const contexto = criarContextoOptico(configObservatorio(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "emitter1" }).state;
  assert.equal(estado.components.mirror1.intensidade, 100);
  assert.equal(estado.components.mirror1.cor, "VERMELHO");
  assert.equal(estado.components.receiver2.intensidade, 100);
  assert.equal(estado.components.receiver2.cor, "VERDE");
});

test("PRISM com luz colorida: só a porta que combina com a cor deixa passar, as outras ficam 0/null", () => {
  const config = {
    components: [
      { id: "emitter1", type: "EMITTER", props: { intensidade: 80, cor: "VERMELHO" } },
      { id: "prism1", type: "PRISM", props: {} },
      { id: "receiverA", type: "RECEIVER", props: { corAlvo: "VERMELHO", intensidadeAlvo: 80, toleranciaIntensidade: 0 } },
      { id: "receiverB", type: "RECEIVER", props: { corAlvo: "VERDE", intensidadeAlvo: 80, toleranciaIntensidade: 0 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "emitter1", port: "out" }, to: { componentId: "prism1", port: "in" } },
      { id: "c2", from: { componentId: "prism1", port: "VERMELHO" }, to: { componentId: "receiverA", port: "in" } },
      { id: "c3", from: { componentId: "prism1", port: "VERDE" }, to: { componentId: "receiverB", port: "in" } },
    ],
  };
  const contexto = criarContextoOptico(config, "seed-cor");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "emitter1" }).state;
  assert.equal(estado.components.receiverA.atingido, true);
  assert.equal(estado.components.receiverB.intensidade, 0);
  assert.equal(estado.components.receiverB.cor, null);
  assert.equal(estado.components.receiverB.atingido, false);
});

test("LENS multiplica a intensidade pelo próprio fator sempre, nunca muda a cor", () => {
  const { estado } = resolverComGoldenSolution();
  // mirror1 recebeu 100 VERMELHO (via prism); lens1 tem fator 0.5
  assert.equal(estado.components.lens1.intensidade, 50);
  assert.equal(estado.components.lens1.cor, "VERMELHO");
});

test("MIRROR: GIRAR alterna refletindo/bloqueando; bloqueado corta a transmissão dali pra frente", () => {
  const contexto = criarContextoOptico(configObservatorio(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "emitter1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "ABRIR", componentId: "shutter1" }).state;
  assert.equal(estado.components.receiver1.atingido, true);

  estado = engine.executarAcao(contexto, estado, { type: "GIRAR", componentId: "mirror1" }).state;
  assert.equal(estado.components.mirror1.refletindo, false);
  assert.equal(estado.components.lens1.intensidade, 0);
  assert.equal(estado.components.shutter1.intensidade, 0);
  assert.equal(estado.components.receiver1.intensidade, 0);
  assert.equal(estado.components.receiver1.atingido, false); // não-sticky: condição recalcula

  // GEAR do grafo mecânico não tinha equivalente de "re-girar de
  // volta"; aqui provamos que SIM dá pra reverter (toggle real).
  estado = engine.executarAcao(contexto, estado, { type: "GIRAR", componentId: "mirror1" }).state;
  assert.equal(estado.components.mirror1.refletindo, true);
  assert.equal(estado.components.receiver1.atingido, true);
});

test("objetivo 'obj_vermelho' é sticky: fechar o obturador depois de concluído não remove da lista", () => {
  const { estado: estadoComAmbos } = resolverComGoldenSolution();
  assert.ok(estadoComAmbos.objetivosConcluidos.includes("obj_vermelho"));
  const contexto = criarContextoOptico(configObservatorio(), "seed-sticky");
  let estado = engine.construirEstadoInicial(contexto);
  for (const acao of GOLDEN_SOLUTION) estado = engine.executarAcao(contexto, estado, acao).state;
  estado = engine.executarAcao(contexto, estado, { type: "FECHAR", componentId: "shutter1" }).state;
  assert.ok(estado.objetivosConcluidos.includes("obj_vermelho")); // continua concluído
  assert.equal(estado.components.receiver1.atingido, false); // mas a condição "ao vivo" já não bate mais
});

test("validarTopologia: aceita o Observatório e rejeita um ciclo PRISM→MIRROR→PRISM", () => {
  assert.doesNotThrow(() => validarTopologia(configObservatorio()));
  const configComCiclo = {
    components: [
      { id: "p1", type: "PRISM", props: {} },
      { id: "m1", type: "MIRROR", props: {} },
    ],
    connections: [
      { id: "c1", from: { componentId: "p1", port: "a" }, to: { componentId: "m1", port: "a" } },
      { id: "c2", from: { componentId: "m1", port: "b" }, to: { componentId: "p1", port: "b" } },
    ],
  };
  assert.throws(() => validarTopologia(configComCiclo), (e) => e.code === "TOPOLOGIA_CICLO");
});

test("runtime: duas fontes (EMITTER) convergindo no mesmo componente é inválido mesmo quando validarTopologia (estrutural) não pega", () => {
  const config = {
    components: [
      { id: "emitter1", type: "EMITTER", props: { intensidade: 50, cor: "VERMELHO" } },
      { id: "emitter2", type: "EMITTER", props: { intensidade: 50, cor: "VERDE" } },
      { id: "mirrorX", type: "MIRROR", props: {} },
    ],
    connections: [
      { id: "c1", from: { componentId: "emitter1", port: "out" }, to: { componentId: "mirrorX", port: "in" } },
      { id: "c2", from: { componentId: "emitter2", port: "out" }, to: { componentId: "mirrorX", port: "in" } },
    ],
  };
  assert.doesNotThrow(() => validarTopologia(config));
  const contexto = criarContextoOptico(config, "seed-conflito");
  assert.throws(
    () => engine.construirEstadoInicial(contexto),
    (e) => e.code === "TOPOLOGIA_CICLO" && e.statusCode === 409,
  );
});

test("registry óptico: validação de props recusa configuração inválida do Admin", () => {
  const registry = criarRegistryOptico();
  assert.throws(() => registry.obter("EMITTER").validarProps({ intensidade: -1, cor: "BRANCO" }), /positivo/);
  assert.throws(() => registry.obter("EMITTER").validarProps({ intensidade: 10, cor: "ROXO" }), /cor/);
  assert.throws(() => registry.obter("LENS").validarProps({ fator: 0 }), /positivo/);
  assert.throws(() => registry.obter("RECEIVER").validarProps({ corAlvo: "AZUL", intensidadeAlvo: -1 }), />= 0/);
  assert.doesNotThrow(() => registry.obter("RECEIVER").validarProps({ corAlvo: "AZUL", intensidadeAlvo: 0 }));
});

test("SHUTTER: fechado por padrão corta a transmissão; ABRIR libera", () => {
  const contexto = criarContextoOptico(configObservatorio(), "seed-1");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "emitter1" }).state;
  assert.equal(estado.components.shutter1.aberto, false);
  assert.equal(estado.components.receiver1.intensidade, 0); // shutter fechado corta

  estado = engine.executarAcao(contexto, estado, { type: "ABRIR", componentId: "shutter1" }).state;
  assert.equal(estado.components.receiver1.intensidade, 50);
  estado = engine.executarAcao(contexto, estado, { type: "FECHAR", componentId: "shutter1" }).state;
  assert.equal(estado.components.receiver1.intensidade, 0);
});

test("feedbackPublico óptico nunca expõe mais do que ligado/intensidade/cor/refletindo/fator/aberto/atingido", () => {
  const { estado } = resolverComGoldenSolution();
  const chavesPermitidas = new Set(["ligado", "intensidade", "cor", "refletindo", "fator", "aberto", "atingido"]);
  for (const feedback of Object.values(estado.public.components)) {
    for (const chave of Object.keys(feedback)) {
      assert.ok(chavesPermitidas.has(chave), `chave inesperada no feedback público: ${chave}`);
    }
  }
});
