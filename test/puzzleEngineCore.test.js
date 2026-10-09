// Evento "O Coração da Máquina Celestial" — Fase 2 (Puzzle Engine
// Determinístico). Testes PUROS — nenhum banco, nenhuma transação,
// nenhum I/O. Cobre: registry declarativo (e sua recusa de
// "comportamento" não-function), RNG determinístico por (seed,
// contador), validação de config/ação, avaliador de condições (todos
// os operadores), objetivos sticky, e a prova central de determinismo:
// duas execuções independentes da MESMA sequência de ações a partir do
// MESMO seed produzem exatamente o mesmo PuzzleState final.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { criarRegistryDeComponentes } = require("../src/services/puzzleComponentRegistry");
const engine = require("../src/services/puzzleEngineCore");

// ---------------------------------------------------------------------------
// Dois tipos de componente MOCK, só pra exercitar o engine — nenhuma
// semântica mecânica/óptica/hidráulica real aqui (isso é Fase 3+).
function construirRegistryDeTeste() {
  const registry = criarRegistryDeComponentes();

  registry.registrar({
    key: "TOGGLE",
    validarProps: (props) => {
      if (props.label !== undefined && typeof props.label !== "string") {
        throw Object.assign(new Error("label precisa ser string."), { statusCode: 400 });
      }
    },
    criarEstado: () => ({ ligado: false }),
    reduzir: ({ state, action }) => {
      if (action.type !== "TOGGLE") return { state, events: [] };
      const novoLigado = !state.ligado;
      return {
        state: { ...state, ligado: novoLigado },
        events: [{ tipo: "TOGGLE_MUDOU", ligado: novoLigado }],
      };
    },
    feedbackPublico: (state) => ({ ligado: state.ligado }),
  });

  registry.registrar({
    key: "COUNTER",
    criarEstado: (props) => ({ valor: props.inicial ?? 0, segredo: "golden-solution-nunca-exposto" }),
    reduzir: ({ state, action, rng }) => {
      if (action.type === "INCREMENT") {
        const delta = Number.isInteger(action.payload?.delta) ? action.payload.delta : 1;
        return { state: { ...state, valor: state.valor + delta }, events: [] };
      }
      if (action.type === "SORTEIO_DETERMINISTICO") {
        // usa o rng pra provar que a mesma sequência de ações no mesmo
        // seed produz o mesmo "sorteio" sempre.
        return { state: { ...state, valor: rng.proximoInt(1000) }, events: [] };
      }
      return { state, events: [] };
    },
    feedbackPublico: (state) => ({ valor: state.valor }), // NUNCA expõe `segredo`
  });

  return registry;
}

function configBasico() {
  return {
    components: [
      { id: "interruptor1", type: "TOGGLE", props: { label: "Alavanca Norte" } },
      { id: "contador1", type: "COUNTER", props: { inicial: 0 } },
    ],
    connections: [{ id: "c1", from: { componentId: "interruptor1", port: "out" }, to: { componentId: "contador1", port: "in" } }],
    objectives: [
      { id: "obj_ligar", descricao: "Ligar o interruptor", condicao: { op: "EQUALS", path: "components.interruptor1.ligado", value: true } },
      { id: "obj_contar_10", descricao: "Chegar a 10", condicao: { op: "GTE", path: "components.contador1.valor", value: 10 } },
    ],
    conditions: [{ id: "painel_aceso", condicao: { op: "EQUALS", path: "components.interruptor1.ligado", value: true } }],
  };
}

// ---------------------------------------------------------------------------
// 1. Registry declarativo
test("registry: recusa definição sem key ou sem reduzir()", () => {
  const registry = criarRegistryDeComponentes();
  assert.throws(() => registry.registrar({ reduzir: () => {} }), /key/);
  assert.throws(() => registry.registrar({ key: "X" }), /reduzir/);
});

test("registry: recusa qualquer campo de comportamento que não seja function (nunca string/JSON executável)", () => {
  const registry = criarRegistryDeComponentes();
  assert.throws(
    () => registry.registrar({ key: "X", reduzir: () => {}, criarEstado: "return {}" }),
    /function/i,
  );
  assert.throws(
    () => registry.registrar({ key: "Y", reduzir: "state.valor = 1" }),
    /function/i,
  );
});

test("registry: recusa key duplicada no mesmo registry", () => {
  const registry = criarRegistryDeComponentes();
  registry.registrar({ key: "X", reduzir: () => ({ state: {} }) });
  assert.throws(() => registry.registrar({ key: "X", reduzir: () => ({ state: {} }) }), /duplicado/);
});

test("registry: obter() de tipo desconhecido lança 400/COMPONENTE_TIPO_DESCONHECIDO", () => {
  const registry = criarRegistryDeComponentes();
  assert.throws(() => registry.obter("NAO_EXISTE"), (e) => e.statusCode === 400 && e.code === "COMPONENTE_TIPO_DESCONHECIDO");
});

test("registry: possui()/listar()/assinatura() refletem o conjunto registrado", () => {
  const registry = criarRegistryDeComponentes();
  assert.equal(registry.possui("TOGGLE"), false);
  registry.registrar({ key: "TOGGLE", reduzir: () => ({ state: {} }) });
  assert.equal(registry.possui("TOGGLE"), true);
  assert.deepEqual(registry.listar(), ["TOGGLE"]);
  const assinaturaA = registry.assinatura();
  registry.registrar({ key: "GEAR", reduzir: () => ({ state: {} }) });
  assert.notEqual(registry.assinatura(), assinaturaA);
});

test("registry: isolado entre instâncias — dois registries podem ter a mesma key com semânticas diferentes sem colidir", () => {
  const registryA = criarRegistryDeComponentes();
  const registryB = criarRegistryDeComponentes();
  registryA.registrar({ key: "GEAR", reduzir: () => ({ state: { origem: "A" } }) });
  registryB.registrar({ key: "GEAR", reduzir: () => ({ state: { origem: "B" } }) });
  assert.equal(registryA.obter("GEAR").reduzir().state.origem, "A");
  assert.equal(registryB.obter("GEAR").reduzir().state.origem, "B");
});

// ---------------------------------------------------------------------------
// 2. RNG determinístico
test("criarRng: mesmo seed+contador produz exatamente a mesma sequência", () => {
  const rngA = engine.criarRng("seed-fixo", 7);
  const rngB = engine.criarRng("seed-fixo", 7);
  const sequenciaA = [rngA.proximoFloat(), rngA.proximoInt(1000), rngA.proximoFloat()];
  const sequenciaB = [rngB.proximoFloat(), rngB.proximoInt(1000), rngB.proximoFloat()];
  assert.deepEqual(sequenciaA, sequenciaB);
});

test("criarRng: contadores diferentes produzem sequências diferentes (mesmo seed)", () => {
  const rngA = engine.criarRng("seed-fixo", 1);
  const rngB = engine.criarRng("seed-fixo", 2);
  assert.notEqual(rngA.proximoFloat(), rngB.proximoFloat());
});

test("criarRng: seeds diferentes produzem sequências diferentes (mesmo contador)", () => {
  const rngA = engine.criarRng("seed-A", 0);
  const rngB = engine.criarRng("seed-B", 0);
  assert.notEqual(rngA.proximoFloat(), rngB.proximoFloat());
});

test("criarRng: rejeita seed vazia/contador inválido", () => {
  assert.throws(() => engine.criarRng("", 0));
  assert.throws(() => engine.criarRng("seed", -1));
  assert.throws(() => engine.criarRng("seed", 1.5));
});

// ---------------------------------------------------------------------------
// 3. Validação de config
test("validarConfig: aceita config bem formado", () => {
  assert.doesNotThrow(() => engine.validarConfig(configBasico()));
});

test("validarConfig: rejeita components ausente/não-array", () => {
  assert.throws(() => engine.validarConfig({}));
  assert.throws(() => engine.validarConfig({ components: "nao-array" }));
});

test("validarConfig: rejeita id de componente duplicado", () => {
  const cfg = { components: [{ id: "a", type: "TOGGLE" }, { id: "a", type: "COUNTER" }] };
  assert.throws(() => engine.validarConfig(cfg), /duplicado/);
});

test("validarConfig: rejeita componente sem type", () => {
  const cfg = { components: [{ id: "a" }] };
  assert.throws(() => engine.validarConfig(cfg), /type/);
});

test("validarConfig: rejeita conexão referenciando componente inexistente", () => {
  const cfg = {
    components: [{ id: "a", type: "TOGGLE" }],
    connections: [{ id: "c1", from: { componentId: "a", port: "out" }, to: { componentId: "fantasma", port: "in" } }],
  };
  assert.throws(() => engine.validarConfig(cfg), /inexistente/);
});

test("validarConfig: rejeita objetivo duplicado ou sem condicao", () => {
  const base = { components: [{ id: "a", type: "TOGGLE" }] };
  assert.throws(() => engine.validarConfig({ ...base, objectives: [{ id: "o1", condicao: {} }, { id: "o1", condicao: {} }] }), /duplicado/);
  assert.throws(() => engine.validarConfig({ ...base, objectives: [{ id: "o1" }] }), /condicao/);
});

test("validarRegistryContraConfig: rejeita tipo de componente não registrado neste registry", () => {
  const registry = construirRegistryDeTeste();
  const cfg = { components: [{ id: "a", type: "NAO_REGISTRADO" }] };
  assert.throws(
    () => engine.validarRegistryContraConfig(cfg, registry),
    (e) => e.code === "COMPONENTE_TIPO_DESCONHECIDO",
  );
});

test("validarRegistryContraConfig: propaga erro de validarProps do próprio tipo", () => {
  const registry = construirRegistryDeTeste();
  const cfg = { components: [{ id: "a", type: "TOGGLE", props: { label: 123 } }] };
  assert.throws(() => engine.validarRegistryContraConfig(cfg, registry), /label/);
});

// ---------------------------------------------------------------------------
// 4. obterConexoesDoComponente
test("obterConexoesDoComponente: filtra por componentId e por porta", () => {
  const cfg = configBasico();
  const todas = engine.obterConexoesDoComponente(cfg, "interruptor1");
  assert.equal(todas.length, 1);
  const porPortaErrada = engine.obterConexoesDoComponente(cfg, "interruptor1", "in");
  assert.equal(porPortaErrada.length, 0);
  const porPortaCerta = engine.obterConexoesDoComponente(cfg, "interruptor1", "out");
  assert.equal(porPortaCerta.length, 1);
});

// ---------------------------------------------------------------------------
// 5. Avaliador de condições — todos os operadores, sem eval
test("avaliarCondicao: operadores de comparação", () => {
  const estado = { nivel: 5, nome: "ouro" };
  assert.equal(engine.avaliarCondicao({ op: "EQUALS", path: "nome", value: "ouro" }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "NOT_EQUALS", path: "nome", value: "prata" }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "GT", path: "nivel", value: 4 }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "GTE", path: "nivel", value: 5 }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "LT", path: "nivel", value: 6 }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "LTE", path: "nivel", value: 5 }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "IN", path: "nome", value: ["ouro", "bronze"] }, estado), true);
  assert.equal(engine.avaliarCondicao({ op: "IN", path: "nome", value: ["bronze"] }, estado), false);
});

test("avaliarCondicao: AND/OR/NOT compostos", () => {
  const estado = { a: true, b: false };
  assert.equal(
    engine.avaliarCondicao({ op: "AND", conditions: [{ op: "EQUALS", path: "a", value: true }, { op: "EQUALS", path: "b", value: false }] }, estado),
    true,
  );
  assert.equal(
    engine.avaliarCondicao({ op: "OR", conditions: [{ op: "EQUALS", path: "a", value: false }, { op: "EQUALS", path: "b", value: false }] }, estado),
    true,
  );
  assert.equal(engine.avaliarCondicao({ op: "NOT", condition: { op: "EQUALS", path: "b", value: false } }, estado), false);
});

test("avaliarCondicao: caminho ausente nunca lança — vira undefined e comparação falha normalmente", () => {
  assert.equal(engine.avaliarCondicao({ op: "EQUALS", path: "a.b.c", value: 1 }, {}), false);
});

test("avaliarCondicao: operador desconhecido ou op ausente lançam erro claro (nunca eval)", () => {
  assert.throws(() => engine.avaliarCondicao({ op: "DELETE_EVERYTHING" }, {}), (e) => e.code === "OPERADOR_DESCONHECIDO");
  assert.throws(() => engine.avaliarCondicao({}, {}));
});

test("guarda arquitetural: puzzleEngineCore.js e puzzleComponentRegistry.js nunca usam eval/Function/vm", () => {
  for (const arquivo of ["puzzleEngineCore.js", "puzzleComponentRegistry.js"]) {
    const codigo = fs.readFileSync(path.join(__dirname, "..", "src", "services", arquivo), "utf8");
    assert.doesNotMatch(codigo, /\beval\s*\(/);
    assert.doesNotMatch(codigo, /new\s+Function\s*\(/);
    assert.doesNotMatch(codigo, /\bFunction\s*\(/);
    assert.doesNotMatch(codigo, /\brequire\(["']vm["']\)/);
  }
});

// ---------------------------------------------------------------------------
// 6. Objetivos sticky
test("avaliarObjetivos: concluído uma vez nunca desconclui mesmo se a condição voltar a ser falsa", () => {
  const objetivos = [{ id: "o1", condicao: { op: "EQUALS", path: "ligado", value: true } }];
  const r1 = engine.avaliarObjetivos(objetivos, { ligado: true }, []);
  assert.deepEqual(r1.objetivosConcluidos, ["o1"]);
  assert.deepEqual(r1.novasConclusoes, ["o1"]);

  // mesma lista de concluídos entra como "anterior" — mesmo com ligado
  // voltando a false, o1 continua concluído e não aparece de novo em
  // novasConclusoes (não gera evento duplicado).
  const r2 = engine.avaliarObjetivos(objetivos, { ligado: false }, r1.objetivosConcluidos);
  assert.deepEqual(r2.objetivosConcluidos, ["o1"]);
  assert.deepEqual(r2.novasConclusoes, []);
});

test("avaliarCondicoesDeclaradas: recalcula a cada chamada (não é sticky) e ignora condições sem id", () => {
  const condicoes = [{ id: "painel", condicao: { op: "EQUALS", path: "ligado", value: true } }, { condicao: { op: "EQUALS", path: "ligado", value: true } }];
  assert.deepEqual(engine.avaliarCondicoesDeclaradas(condicoes, { ligado: true }), ["painel"]);
  assert.deepEqual(engine.avaliarCondicoesDeclaradas(condicoes, { ligado: false }), []);
});

// ---------------------------------------------------------------------------
// 7. construirEstadoInicial / validarAcao / executarAcao
test("construirEstadoInicial: monta components via criarEstado() e public via feedbackPublico() (nunca expõe segredo)", () => {
  const registry = construirRegistryDeTeste();
  const contexto = { config: configBasico(), seed: "seed-abc", registry };
  const estado = engine.construirEstadoInicial(contexto);
  assert.deepEqual(estado.components.interruptor1, { ligado: false });
  assert.equal(estado.components.contador1.valor, 0);
  assert.equal("segredo" in estado.components.contador1, true); // interno existe...
  assert.equal("segredo" in estado.public.components.contador1, false); // ...mas nunca no feedback público
  assert.deepEqual(estado.objetivosConcluidos, []);
});

test("validarAcao: rejeita ação sem type, payload não-objeto, e componentId inexistente", () => {
  const registry = construirRegistryDeTeste();
  const cfg = configBasico();
  assert.throws(() => engine.validarAcao(cfg, registry, {}), /type/);
  assert.throws(() => engine.validarAcao(cfg, registry, { type: "X", payload: "nao-objeto" }), /payload/);
  assert.throws(
    () => engine.validarAcao(cfg, registry, { type: "TOGGLE", componentId: "fantasma" }),
    (e) => e.code === "COMPONENTE_INEXISTENTE",
  );
});

test("executarAcao: TOGGLE muda estado, gera evento e conclui objetivo 'ligar'", () => {
  const registry = construirRegistryDeTeste();
  const contexto = { config: configBasico(), seed: "seed-1", registry };
  const estadoInicial = engine.construirEstadoInicial(contexto);

  const resultado = engine.executarAcao(contexto, estadoInicial, { type: "TOGGLE", componentId: "interruptor1" });
  assert.equal(resultado.state.components.interruptor1.ligado, true);
  assert.equal(resultado.feedbackPublico.components.interruptor1.ligado, true);
  assert.deepEqual(resultado.objetivosRecemConcluidos, ["obj_ligar"]);
  assert.deepEqual(resultado.condicoesAtingidas, ["painel_aceso"]);
  assert.ok(resultado.eventos.some((e) => e.tipo === "TOGGLE_MUDOU"));
  assert.ok(resultado.eventos.some((e) => e.tipo === "OBJETIVO_CONCLUIDO" && e.objetivoId === "obj_ligar"));
  assert.equal(resultado.state.rngContador, 1);
});

test("executarAcao: rngContador avança mesmo em ação sem componentId (contagem uniforme pro determinismo)", () => {
  const registry = construirRegistryDeTeste();
  const contexto = { config: configBasico(), seed: "seed-1", registry };
  const estadoInicial = engine.construirEstadoInicial(contexto);
  const resultado = engine.executarAcao(contexto, estadoInicial, { type: "NOOP_GLOBAL" });
  assert.equal(resultado.state.rngContador, 1);
  assert.deepEqual(resultado.state.components, estadoInicial.components);
});

test("executarAcao: nunca aceita completed/success/reward do payload — só o engine decide via objetivos/condições", () => {
  const registry = construirRegistryDeTeste();
  const contexto = { config: configBasico(), seed: "seed-1", registry };
  const estadoInicial = engine.construirEstadoInicial(contexto);
  const resultado = engine.executarAcao(contexto, estadoInicial, {
    type: "INCREMENT",
    componentId: "contador1",
    payload: { delta: 1, completed: true, success: true, reward: "GOLD_1000" },
  });
  // o engine ignora completed/success/reward do payload — só soma delta
  assert.equal(resultado.state.components.contador1.valor, 1);
  assert.deepEqual(resultado.objetivosRecemConcluidos, []); // 1 < 10, obj_contar_10 não bate
});

test("DETERMINISMO: duas execuções independentes da mesma sequência de ações, mesmo seed, produzem o MESMO state final", () => {
  const sequenciaDeAcoes = [
    { type: "TOGGLE", componentId: "interruptor1" },
    { type: "INCREMENT", componentId: "contador1", payload: { delta: 3 } },
    { type: "SORTEIO_DETERMINISTICO", componentId: "contador1" },
    { type: "TOGGLE", componentId: "interruptor1" },
    { type: "INCREMENT", componentId: "contador1", payload: { delta: 5 } },
  ];

  function simular() {
    const registry = construirRegistryDeTeste();
    const contexto = { config: configBasico(), seed: "seed-determinismo-42", registry };
    let estado = engine.construirEstadoInicial(contexto);
    const eventosAcumulados = [];
    for (const acao of sequenciaDeAcoes) {
      const resultado = engine.executarAcao(contexto, estado, acao);
      estado = resultado.state;
      eventosAcumulados.push(...resultado.eventos);
    }
    return { estado, eventosAcumulados };
  }

  const execucaoA = simular();
  const execucaoB = simular();
  assert.deepEqual(execucaoA.estado, execucaoB.estado);
  assert.deepEqual(execucaoA.eventosAcumulados, execucaoB.eventosAcumulados);

  // e um seed DIFERENTE, na mesma sequência de ações, diverge no passo
  // que usa rng (prova que o seed realmente influencia o resultado).
  function simularComSeed(seed) {
    const registry = construirRegistryDeTeste();
    const contexto = { config: configBasico(), seed, registry };
    let estado = engine.construirEstadoInicial(contexto);
    for (const acao of sequenciaDeAcoes) {
      estado = engine.executarAcao(contexto, estado, acao).state;
    }
    return estado;
  }
  const comOutroSeed = simularComSeed("seed-determinismo-99");
  assert.notEqual(execucaoA.estado.components.contador1.valor, comOutroSeed.components.contador1.valor);
});

test("executarAcao: componentId inexistente ou state inválido lançam, sem mutar nada", () => {
  const registry = construirRegistryDeTeste();
  const contexto = { config: configBasico(), seed: "seed-1", registry };
  const estadoInicial = engine.construirEstadoInicial(contexto);
  assert.throws(
    () => engine.executarAcao(contexto, estadoInicial, { type: "TOGGLE", componentId: "fantasma" }),
    (e) => e.code === "COMPONENTE_INEXISTENTE",
  );
  assert.throws(() => engine.executarAcao(contexto, null, { type: "TOGGLE" }));
});

test("executarAcao: reduzir() que não devolve { state } é rejeitado com erro claro (contrato do registry)", () => {
  const registry = criarRegistryDeComponentes();
  registry.registrar({ key: "QUEBRADO", criarEstado: () => ({}), reduzir: () => undefined, feedbackPublico: () => ({}) });
  const cfg = { components: [{ id: "x", type: "QUEBRADO" }] };
  const contexto = { config: cfg, seed: "seed-1", registry };
  const estadoInicial = engine.construirEstadoInicial(contexto);
  assert.throws(() => engine.executarAcao(contexto, estadoInicial, { type: "QUALQUER", componentId: "x" }), /reduzir/);
});

test("assinarConfig: mesmo config produz mesma assinatura; config diferente diverge", () => {
  const cfg = configBasico();
  assert.equal(engine.assinarConfig(cfg), engine.assinarConfig(configBasico()));
  const cfgMutado = { ...cfg, components: [...cfg.components, { id: "extra", type: "TOGGLE" }] };
  assert.notEqual(engine.assinarConfig(cfg), engine.assinarConfig(cfgMutado));
});
