// Evento "O Coração da Máquina Celestial" — Fase 8 (Ações de puzzle via
// API/Realtime). Cobre o pipeline real de ação ponta-a-ponta: criação de
// Instance com `config.dominio` real (engine nasce já inicializado, nunca
// `state: {}` esperando a 1ª ação), transições de status via ação real
// (CREATED→ACTIVE→COMPLETED), detecção de conclusão via
// `todosObjetivosConcluidos` (nunca aceita isso do cliente), conflito de
// `expectedStateVersion` (409), ownership (404) e rejeição de ação sobre
// instância em estado terminal (409). Usa a fixture mecânica real da Fase
// 3 ("Câmara das Engrenagens") — golden solution só aqui, nunca em
// frontend/DTO.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const { PuzzleBlueprintVersion, PuzzleInstance } = require("../src/models/eventPuzzleModels");

const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");
const puzzleActionService = require("../src/services/puzzleActionService");
const engine = require("../src/services/puzzleEngineCore");
const { resolverContexto } = require("../src/services/puzzleDomainRegistry");

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

// Mesma fixture canônica de test/puzzleMechanicalComponents.test.js —
// Motor → Gear(20) → Gear(40) → Clutch → Output(alvo 60 CCW), + uma
// Lever solta como 2º objetivo independente. Aqui com `dominio:
// "MECANICO"` pra puzzleDomainRegistry.resolverContexto reconhecer.
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

// Mesma GOLDEN SOLUTION da Fase 3 — nunca exposta a cliente/DTO.
const GOLDEN_SOLUTION = [
  { type: "LIGAR", componentId: "motor1" },
  { type: "ENGATAR", componentId: "clutch1" },
  { type: "ACIONAR", componentId: "lever1" },
];

// Fundação completa (mesmo padrão de eventPuzzleFoundation.test.js), mas
// com um config real de domínio em vez do placeholder `{titulo_publico}`
// da Fase 1.
async function criarFundacaoComDominio(config, transaction) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar(
    { key: `evento-${chave}`, nome: `Evento ${chave}` },
    transaction,
  );
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED", transaction);

  const edicao = await eventEditionService.criar(
    definicao.id,
    { key: `edicao-${chave}`, nome: `Edição ${chave}` },
    transaction,
  );
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
// 1. Criação já nasce com o state do engine (nunca `{}` à espera da 1ª
//    ação quando o config declara `dominio`).
// ---------------------------------------------------------------------

testeComBanco("Instance com config.dominio nasce com o state exato que engine.construirEstadoInicial produziria", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const { instancia, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true);
  assert.equal(instancia.status, "CREATED");

  const esperado = engine.construirEstadoInicial(resolverContexto(config, instancia.seed));
  assert.deepEqual(instancia.state, esperado);
  // componentes ainda não ligados — motor parado, output não atingido.
  assert.equal(instancia.state.components.motor1.ligado, false);
  assert.equal(instancia.state.components.output1.atingido, false);
});

// ---------------------------------------------------------------------
// 2. executarAcao: 1ª ação sobe CREATED→ACTIVE e persiste o novo state
//    (nunca aceita completed/success/reward vindos do corpo da ação).
// ---------------------------------------------------------------------

testeComBanco("executarAcao: 1ª ação válida sobe CREATED→ACTIVE e incrementa state_version", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(instancia.state_version, 0);

  const { instancia: atualizada, resultado } = await puzzleActionService.executarAcao(
    instancia.id,
    personagem.id,
    { type: "LIGAR", componentId: "motor1" },
    0,
  );
  assert.equal(atualizada.status, "ACTIVE");
  assert.equal(atualizada.state_version, 1);
  assert.ok(atualizada.started_at);
  assert.equal(resultado.state.components.motor1.ligado, true);
  assert.equal(resultado.state.components.gear1.rpm, 120);

  // persistido de verdade, não só devolvido em memória.
  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.status, "ACTIVE");
  assert.equal(recarregada.state_version, 1);
  assert.equal(recarregada.state.components.motor1.ligado, true);
});

// ---------------------------------------------------------------------
// 3. Golden solution via ações reais conclui os 2 objetivos e vira
//    COMPLETED exatamente quando todosObjetivosConcluidos fica true —
//    nunca antes, nunca por confiar num campo enviado pelo cliente.
// ---------------------------------------------------------------------

testeComBanco("golden solution via executarAcao real conclui os objetivos e vira COMPLETED só no fim", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });

  let versaoEsperada = 0;
  let instanciaAtual;
  for (const acao of GOLDEN_SOLUTION) {
    const { instancia: passo } = await puzzleActionService.executarAcao(instancia.id, personagem.id, acao, versaoEsperada);
    versaoEsperada += 1;
    instanciaAtual = passo;
    // só a ÚLTIMA ação (ACIONAR lever1, que fecha o 2º objetivo) deve
    // completar — as anteriores já resolvem obj_rotacao mas não
    // obj_alavanca, então o puzzle não pode estar COMPLETED ainda.
    if (acao.componentId !== "lever1") {
      assert.notEqual(passo.status, "COMPLETED", `ação ${acao.type} ${acao.componentId} não deveria completar o puzzle ainda`);
    }
  }

  assert.equal(instanciaAtual.status, "COMPLETED");
  assert.ok(instanciaAtual.completed_at);
  assert.deepEqual(
    new Set(instanciaAtual.state.objetivosConcluidos),
    new Set(["obj_rotacao", "obj_alavanca"]),
  );

  // depois de COMPLETED, nenhuma ação nova é aceita (terminal).
  await assert.rejects(
    () => puzzleActionService.executarAcao(instancia.id, personagem.id, { type: "DESENGATAR", componentId: "clutch1" }, versaoEsperada),
    (e) => e.statusCode === 409 && e.code === "INSTANCIA_FINALIZADA",
  );
});

// ---------------------------------------------------------------------
// 4. expectedStateVersion desatualizado => 409 CONFLITO_VERSAO, e a
//    tentativa stale nunca aplica nada (version final é só +1, da ação
//    que realmente venceu, não +2).
// ---------------------------------------------------------------------

testeComBanco("executarAcao com stateVersion desatualizado rejeita com CONFLITO_VERSAO (409) e não aplica nada", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });

  await puzzleActionService.executarAcao(instancia.id, personagem.id, { type: "LIGAR", componentId: "motor1" }, 0);
  // agora state_version=1; reenviar expectedStateVersion=0 é stale.
  await assert.rejects(
    () => puzzleActionService.executarAcao(instancia.id, personagem.id, { type: "ENGATAR", componentId: "clutch1" }, 0),
    (e) => e.statusCode === 409 && e.code === "CONFLITO_VERSAO",
  );

  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.state_version, 1, "a tentativa stale não incrementou nada");
  assert.equal(recarregada.state.components.clutch1.rpm, 0, "a ação stale (ENGATAR) nunca chegou a ser aplicada");
});

// ---------------------------------------------------------------------
// 5. Ownership — personagem alheio nunca executa ação sobre instância
//    de outro (404, não 403 — nunca confirma que a instância existe).
// ---------------------------------------------------------------------

testeComBanco("executarAcao: personagem que não é dono da instância recebe 404", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem: dono } = await criarPersonagem({ nivel: 5 });
  const { personagem: intruso } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: dono.id,
    nome: dono.nome,
  });

  await assert.rejects(
    () => puzzleActionService.executarAcao(instancia.id, intruso.id, { type: "LIGAR", componentId: "motor1" }, 0),
    (e) => e.statusCode === 404,
  );

  // a instância do dono nunca foi tocada pela tentativa do intruso.
  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.state_version, 0);
  assert.equal(recarregada.status, "CREATED");
});

// ---------------------------------------------------------------------
// 6. Instância em estado terminal (ABANDONED/EXPIRED/FAILED) nunca
//    aceita ação nova — mesma regra "terminal" verificada acima pra
//    COMPLETED, mas chegando lá por uma transição diferente.
// ---------------------------------------------------------------------

testeComBanco("executarAcao sobre instância ABANDONED (terminal) rejeita com INSTANCIA_FINALIZADA (409)", async () => {
  const config = configCamaraDasEngrenagens();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await puzzleInstanceService.aplicarMutacao(instancia.id, 0, { novoStatus: "ABANDONED" });

  await assert.rejects(
    () => puzzleActionService.executarAcao(instancia.id, personagem.id, { type: "LIGAR", componentId: "motor1" }, 1),
    (e) => e.statusCode === 409 && e.code === "INSTANCIA_FINALIZADA",
  );
});

// ---------------------------------------------------------------------
// 6b. Edge case real (bug corrigido nesta fase): um puzzle de 1 único
//     passo que já resolve tudo na própria ação que sai de CREATED.
//     TRANSICOES_VALIDAS nunca permite CREATED→COMPLETED direto (tem
//     que passar por ACTIVE — é onde started_at nasce), então a 1ª
//     ação precisa completar em 2 mutações sequenciais na MESMA
//     chamada; sem isso, a instância ficaria ACTIVE pra sempre com
//     tudo resolvido, esperando uma 2ª ação que pode nunca vir.
// ---------------------------------------------------------------------

function configPasoUnico() {
  return {
    dominio: "MECANICO",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 100, sentido: "CW" } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 100, sentidoAlvo: "CW", toleranciaRpm: 0 } },
    ],
    connections: [
      { id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } },
    ],
    objectives: [
      { id: "obj_unico", descricao: "Ligar o motor", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
    ],
  };
}

testeComBanco("1ª ação que já resolve tudo (CREATED) vira COMPLETED na mesma chamada, nunca fica presa em ACTIVE", async () => {
  const config = configPasoUnico();
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(config, t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(instancia.status, "CREATED");

  const { instancia: atualizada } = await puzzleActionService.executarAcao(
    instancia.id,
    personagem.id,
    { type: "LIGAR", componentId: "motor1" },
    0,
  );
  assert.equal(atualizada.status, "COMPLETED");
  assert.ok(atualizada.started_at, "passou por ACTIVE de verdade — started_at precisa existir");
  assert.ok(atualizada.completed_at);
  assert.equal(atualizada.state_version, 2, "2 mutações sequenciais nesta mesma chamada (ACTIVE, depois COMPLETED)");
  assert.deepEqual(atualizada.state.objetivosConcluidos, ["obj_unico"]);

  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.status, "COMPLETED");
  assert.equal(recarregada.state_version, 2);
});

// ---------------------------------------------------------------------
// 7. Config sem `dominio` (placeholders da Fase 1) continua intocado —
//    nenhuma regressão: criarOuObterInstancia cai no `state: {}` de
//    sempre, exatamente como antes da Fase 8.
// ---------------------------------------------------------------------

testeComBanco("config sem dominio (placeholder pré-Fase-8) continua nascendo com state {} — nenhuma regressão", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) =>
    criarFundacaoComDominio({ titulo_publico: "Puzzle sem engine ainda" }, t),
  );
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.deepEqual(instancia.state, {});
});

// ---------------------------------------------------------------------
// 8. Blueprint malformado (dominio desconhecido) falha CEDO na criação
//    da Instance, nunca silenciosamente na 1ª ação de um jogador real.
// ---------------------------------------------------------------------

testeComBanco("Blueprint com dominio desconhecido falha na criação da Instance (nunca cria instância quebrada)", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) =>
    criarFundacaoComDominio({ dominio: "INEXISTENTE", components: [] }, t),
  );
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await assert.rejects(
    () =>
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
        id: personagem.id,
        nome: personagem.nome,
      }),
    (e) => e.statusCode === 400 && e.code === "DOMINIO_DESCONHECIDO",
  );
  // nenhuma instância órfã deixada pra trás (toda a criação roda numa
  // única transaction que o erro reverte por completo).
  const versao = await PuzzleBlueprintVersion.findOne({ where: { id_blueprint: blueprint.id } });
  const instanciasDessaVersao = await PuzzleInstance.count({ where: { id_blueprint_version: versao.id } });
  assert.equal(instanciasDessaVersao, 0);
});
