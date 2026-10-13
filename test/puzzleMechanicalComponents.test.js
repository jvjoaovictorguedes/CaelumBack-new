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
  classificarRessonancia,
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

// Atualizado pela evolução "RPM ajustável": OUTPUT nunca mais expõe
// `atingido` cru (substituído por `ressonancia`, qualitativa — ver
// testes de ressonância abaixo); MOTOR ajustável pode expor
// ajustavel/rpmConfigurado/rpmMin/rpmMax/rpmStep (motor LEGADO, como o
// desta fixture, nunca expõe essas chaves — ver teste seguinte).
test("feedbackPublico mecânico nunca expõe mais do que rpm/sentido/ressonancia/dentes/raio/ligado/engatada/acionada/ajustavel/rpmConfigurado/rpmMin/rpmMax/rpmStep", () => {
  const { estado } = resolverComGoldenSolution();
  const chavesPermitidas = new Set([
    "ligado",
    "rpm",
    "sentido",
    "dentes",
    "raio",
    "engatada",
    "acionada",
    "ressonancia",
    "ajustavel",
    "rpmConfigurado",
    "rpmMin",
    "rpmMax",
    "rpmStep",
  ]);
  for (const feedback of Object.values(estado.public.components)) {
    for (const chave of Object.keys(feedback)) {
      assert.ok(chavesPermitidas.has(chave), `chave inesperada no feedback público: ${chave}`);
    }
  }
});

test("feedbackPublico do OUTPUT nunca inclui `atingido` nem revela rpmAlvo/toleranciaRpm/sentidoAlvo", () => {
  const { estado } = resolverComGoldenSolution();
  const fb = estado.public.components.output1;
  assert.ok(!("atingido" in fb), "atingido não pode atravessar pro feedback público");
  assert.ok(!("rpmAlvo" in fb) && !("toleranciaRpm" in fb) && !("sentidoAlvo" in fb));
  // `rpm`/`sentido` continuam públicos de propósito (seção 10 — "RPM
  // ATUAL da transmissão é informação física observável"); o que nunca
  // pode aparecer são as CHAVES do alvo em si, já checado acima.
  assert.deepEqual(Object.keys(fb).sort(), ["rpm", "ressonancia", "sentido"].sort());
  assert.equal(fb.ressonancia, "ESTAVEL"); // golden solution resolve exatamente o alvo
});

test("feedbackPublico do MOTOR legado (sem ajustavel) nunca expõe rpmConfigurado/rpmMin/rpmMax/rpmStep/ajustavel", () => {
  const { estado } = resolverComGoldenSolution();
  const fb = estado.public.components.motor1;
  assert.deepEqual(Object.keys(fb).sort(), ["ligado", "rpm", "sentido"]);
});

// ---------------------------------------------------------------------------
// Evolução "RPM ajustável" — MOTOR com `ajustavel: true` (seções 1-4 da
// encomenda). Fixture própria, separada da Câmara das Engrenagens
// (legada), pra nunca misturar os dois contratos.
function configMotorAjustavel() {
  return {
    components: [
      { id: "motor1", type: "MOTOR", props: { ajustavel: true, rpmInicial: 100, rpmMin: 60, rpmMax: 240, rpmStep: 10, sentido: "CW" } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 150, sentidoAlvo: "CW", toleranciaRpm: 0 } },
    ],
    connections: [{ id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } }],
    objectives: [{ id: "obj1", descricao: "Atingir a rotação de saída", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } }],
  };
}

test("motor legado (sem ajustavel) continua funcionando exatamente como antes — compatibilidade", () => {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-legado");
  let estado = engine.construirEstadoInicial(contexto);
  assert.deepEqual(estado.components.motor1, { ligado: false, rpm: 0, sentido: null });
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  assert.equal(estado.components.motor1.rpm, 120); // rpmNominal do config, nunca mudou
});

test("motor ajustável nasce com rpmConfigurado = rpmInicial, desligado (rpm efetivo 0)", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  const estado = engine.construirEstadoInicial(contexto);
  assert.equal(estado.components.motor1.ligado, false);
  assert.equal(estado.components.motor1.rpmConfigurado, 100);
  assert.equal(estado.components.motor1.rpm, 0);
});

test("LIGAR um motor ajustável usa rpmConfigurado (nunca um rpmNominal, que nem existe nesta fixture)", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  assert.equal(estado.components.motor1.rpm, 100);
  assert.equal(estado.components.output1.rpm, 100);
});

test("AJUSTAR_RPM dentro do range/step funciona e recalcula a transmissão imediatamente", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  estado = engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: 150 } }).state;
  assert.equal(estado.components.motor1.rpmConfigurado, 150);
  assert.equal(estado.components.motor1.rpm, 150);
  assert.equal(estado.components.output1.rpm, 150); // transmissão 1:1 nesta fixture — recalculada na MESMA ação
  assert.equal(estado.components.output1.atingido, true); // alvo era 150
});

test("AJUSTAR_RPM com motor desligado só guarda rpmConfigurado — rpm efetivo continua 0 até LIGAR", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  let estado = engine.construirEstadoInicial(contexto);
  estado = engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: 150 } }).state;
  assert.equal(estado.components.motor1.rpmConfigurado, 150);
  assert.equal(estado.components.motor1.rpm, 0);
  estado = engine.executarAcao(contexto, estado, { type: "LIGAR", componentId: "motor1" }).state;
  assert.equal(estado.components.motor1.rpm, 150); // usa o rpmConfigurado já ajustado, não um default
});

test("AJUSTAR_RPM: abaixo de rpmMin rejeita", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  const estado = engine.construirEstadoInicial(contexto);
  assert.throws(
    () => engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: 50 } }),
    (e) => e.statusCode === 400 && e.code === "RPM_FORA_DO_LIMITE",
  );
});

test("AJUSTAR_RPM: acima de rpmMax rejeita", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  const estado = engine.construirEstadoInicial(contexto);
  assert.throws(
    () => engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: 241 } }),
    (e) => e.statusCode === 400 && e.code === "RPM_FORA_DO_LIMITE",
  );
});

test("AJUSTAR_RPM: fora do passo (rpmStep) rejeita — 65 e 71 não são múltiplos de 10 a partir de 60", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  const estado = engine.construirEstadoInicial(contexto);
  for (const rpmInvalido of [65, 71]) {
    assert.throws(
      () => engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: rpmInvalido } }),
      (e) => e.statusCode === 400 && e.code === "RPM_FORA_DO_PASSO",
      `rpm=${rpmInvalido} deveria ser rejeitado por passo`,
    );
  }
  // Toda a faixa 60..240 de 10 em 10 é válida.
  for (let rpmValido = 60; rpmValido <= 240; rpmValido += 10) {
    assert.doesNotThrow(() =>
      engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: rpmValido } }),
    );
  }
});

test("AJUSTAR_RPM: não-inteiro/não-número rejeita", () => {
  const contexto = criarContextoMecanico(configMotorAjustavel(), "seed-ajustavel");
  const estado = engine.construirEstadoInicial(contexto);
  for (const payload of [{ rpm: 100.5 }, { rpm: "100" }, { rpm: NaN }, {}]) {
    assert.throws(
      () => engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload }),
      (e) => e.statusCode === 400 && e.code === "RPM_INVALIDO",
    );
  }
});

test("AJUSTAR_RPM num motor LEGADO (sem ajustavel) é rejeitado — cliente nunca controla um motor fixo", () => {
  const contexto = criarContextoMecanico(configCamaraDasEngrenagens(), "seed-legado");
  const estado = engine.construirEstadoInicial(contexto);
  assert.throws(
    () => engine.executarAcao(contexto, estado, { type: "AJUSTAR_RPM", componentId: "motor1", payload: { rpm: 100 } }),
    (e) => e.statusCode === 400 && e.code === "MOTOR_NAO_AJUSTAVEL",
  );
});

test("validarProps do MOTOR ajustável exige rpmMin<rpmMax e rpmInicial alcançável pelo step", () => {
  const registry = criarRegistryMecanico();
  assert.throws(() => registry.obter("MOTOR").validarProps({ ajustavel: true, rpmMin: 100, rpmMax: 60, rpmStep: 10, rpmInicial: 80, sentido: "CW" }));
  assert.throws(() => registry.obter("MOTOR").validarProps({ ajustavel: true, rpmMin: 60, rpmMax: 240, rpmStep: 10, rpmInicial: 65, sentido: "CW" }));
  assert.doesNotThrow(() =>
    registry.obter("MOTOR").validarProps({ ajustavel: true, rpmMin: 60, rpmMax: 240, rpmStep: 10, rpmInicial: 100, sentido: "CW" }),
  );
});

// ---------------------------------------------------------------------------
// Ressonância qualitativa do OUTPUT (seções 8/9) — NUNCA revela o
// valor-alvo, só uma das 4 faixas. `classificarRessonancia` é pura:
// testada diretamente, sem precisar rodar o engine inteiro.
test("classificarRessonancia: dentro da tolerância + sentido correto = ESTAVEL", () => {
  const props = { rpmAlvo: 100, toleranciaRpm: 2, sentidoAlvo: "CW" };
  assert.equal(classificarRessonancia(props, { rpm: 100, sentido: "CW" }), "ESTAVEL");
  assert.equal(classificarRessonancia(props, { rpm: 101, sentido: "CW" }), "ESTAVEL");
});

test("classificarRessonancia: rpm exatamente no alvo mas sentido ERRADO nunca é ESTAVEL", () => {
  const props = { rpmAlvo: 100, toleranciaRpm: 0, sentidoAlvo: "CW" };
  const classe = classificarRessonancia(props, { rpm: 100, sentido: "CCW" });
  assert.notEqual(classe, "ESTAVEL");
  assert.equal(classe, "PROXIMA"); // fisicamente "no alvo", só invertido
});

test("classificarRessonancia: faixas de distância percentual (sem revelar o alvo)", () => {
  const props = { rpmAlvo: 100, toleranciaRpm: 0, sentidoAlvo: "CW" };
  assert.equal(classificarRessonancia(props, { rpm: 108, sentido: "CW" }), "PROXIMA"); // 8% <= 10%
  assert.equal(classificarRessonancia(props, { rpm: 120, sentido: "CW" }), "FRACA"); // 20% <= 25%
  assert.equal(classificarRessonancia(props, { rpm: 200, sentido: "CW" }), "SEM_RESONANCIA"); // 100%
});

test("classificarRessonancia nunca lança nem referencia o alvo quando alvo=0 (sem divisão por zero)", () => {
  const props = { rpmAlvo: 0, toleranciaRpm: 0, sentidoAlvo: undefined };
  assert.equal(classificarRessonancia(props, { rpm: 0, sentido: null }), "ESTAVEL");
  assert.doesNotThrow(() => classificarRessonancia(props, { rpm: 50, sentido: null }));
});
