// Evento "O Coração da Máquina Celestial" — Fase 12 (Conteúdo completo
// do evento / fluxo end-to-end). Cobre o que a auditoria pré-Fase-12
// achou faltando: progressão real entre salas (ordem/pré-requisito,
// enforcement real na criação — nunca só um filtro de listagem),
// layout público sem vazar `condicao`/segredo, expiração preguiçosa de
// Instance parada, abandono voluntário, e a prova final: a migration de
// conteúdo real (20270214010002) produz 4 salas que um personagem
// consegue resolver de ponta a ponta na ordem certa usando as golden
// solutions reais (nunca um mock paralelo).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const { PuzzleInstance } = require("../src/models/eventPuzzleModels");
const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");
const puzzleActionService = require("../src/services/puzzleActionService");
const migrationConteudo = require("../src/migrations/20270214010002-event-puzzle-fase12-conteudo.js");

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

function configSimples(dominio, objectiveId = "obj1") {
  return {
    dominio,
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" }, position: { x: 0, y: 0 } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 1, y: 0 } },
    ],
    connections: [{ id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } }],
    objectives: [{ id: objectiveId, descricao: "Ligar o motor", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } }],
  };
}

// Fundação de 2 salas encadeadas (salaB.prerequisito = salaA) — mesma
// forma de criarFundacaoComDominio de puzzleActionService.test.js, só
// que com DUAS salas e `id_blueprint_prerequisito`.
async function criarFundacaoComDuasSalas(transaction) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` }, transaction);
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED", transaction);
  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: `Edição ${chave}` }, transaction);
  await eventEditionService.transicionar(edicao.id, "ACTIVE", transaction);

  const { blueprint: blueprintA, versao: versaoA } = await puzzleBlueprintService.criarBlueprint(
    definicao.id,
    { key: `sala-a-${chave}`, nome: "Sala A", ordem: 1 },
    transaction,
  );
  await puzzleBlueprintService.atualizarDraft(versaoA.id, { config: configSimples("MECANICO", "obj_a") }, transaction);
  const versaoAPublicada = await puzzleBlueprintService.transicionar(versaoA.id, "PUBLISHED", {}, transaction);

  const { blueprint: blueprintB, versao: versaoB } = await puzzleBlueprintService.criarBlueprint(
    definicao.id,
    { key: `sala-b-${chave}`, nome: "Sala B", ordem: 2, id_blueprint_prerequisito: blueprintA.id },
    transaction,
  );
  await puzzleBlueprintService.atualizarDraft(versaoB.id, { config: configSimples("MECANICO", "obj_b") }, transaction);
  const versaoBPublicada = await puzzleBlueprintService.transicionar(versaoB.id, "PUBLISHED", {}, transaction);

  return { definicao, edicao, blueprintA, versaoA: versaoAPublicada, blueprintB, versaoB: versaoBPublicada };
}

const LIGAR_MOTOR = { type: "LIGAR", componentId: "motor1" };

// -----------------------------------------------------------------------
// 1. Enforcement real do pré-requisito na CRIAÇÃO (nunca só um filtro de
//    listagem) — a garantia que importa de verdade.
// -----------------------------------------------------------------------

testeComBanco("criarOuObterInstancia rejeita a sala B antes da sala A estar COMPLETED (mesma edição)", async () => {
  const { edicao, blueprintB } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  await assert.rejects(
    () => puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintB.id, { id: personagem.id, nome: personagem.nome }),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, "PRE_REQUISITO_PENDENTE");
      return true;
    },
  );
});

testeComBanco("criarOuObterInstancia libera a sala B depois da sala A ser COMPLETED na mesma edição", async () => {
  const { edicao, blueprintA, blueprintB } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const { instancia: instanciaA } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await puzzleActionService.executarAcao(instanciaA.id, personagem.id, LIGAR_MOTOR, instanciaA.state_version);

  const { instancia: instanciaB, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintB.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true);
  assert.equal(instanciaB.status, "CREATED");
});

testeComBanco("sala sem id_blueprint_prerequisito nunca é bloqueada (sala inicial)", async () => {
  const { edicao, blueprintA } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true);
});

// -----------------------------------------------------------------------
// 2. listarPublicosPorEdicao: `bloqueado` reflete o progresso real do
//    personagem, e salas bloqueadas NUNCA mandam `layout`.
// -----------------------------------------------------------------------

testeComBanco("listarPublicosPorEdicao: sala B vem bloqueada (sem layout) até a sala A ser concluída, depois desbloqueia", async () => {
  const { definicao, edicao, blueprintA } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const antes = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
  const salaAantes = antes.find((s) => s.key.startsWith("sala-a-"));
  const salaBantes = antes.find((s) => s.key.startsWith("sala-b-"));
  assert.equal(salaAantes.bloqueado, false);
  assert.ok(salaAantes.layout);
  assert.equal(salaBantes.bloqueado, true);
  assert.equal(salaBantes.layout, undefined);

  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await puzzleActionService.executarAcao(instancia.id, personagem.id, LIGAR_MOTOR, instancia.state_version);

  const depois = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
  const salaBdepois = depois.find((s) => s.key.startsWith("sala-b-"));
  assert.equal(salaBdepois.bloqueado, false);
  assert.ok(salaBdepois.layout);
});

testeComBanco("dtoPublicoLayout nunca expõe `condicao` dos objectives nem chaves fora do allowlist", async () => {
  const { versaoA } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const layout = puzzleBlueprintService.dtoPublicoLayout(versaoA);
  assert.equal(layout.dominio, "MECANICO");
  for (const objetivo of layout.objectives) {
    assert.deepEqual(Object.keys(objetivo).sort(), ["descricao", "id"]);
  }
  for (const componente of layout.components) {
    assert.deepEqual(Object.keys(componente).sort(), ["id", "position", "props", "type"]);
  }
});

// -----------------------------------------------------------------------
// 3. Expiração preguiçosa — nenhum scheduler, só a leitura pelo dono.
// -----------------------------------------------------------------------

testeComBanco("obterParaPersonagem expira preguiçosamente uma Instance CREATED com expires_at no passado", async () => {
  const { edicao, blueprintA } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.ok(instancia.expires_at, "criarOuObterInstancia precisa setar expires_at.");

  await PuzzleInstance.update({ expires_at: new Date(Date.now() - 1000) }, { where: { id: instancia.id } });

  const releitura = await puzzleInstanceService.obterParaPersonagem(instancia.id, personagem.id);
  assert.equal(releitura.status, "EXPIRED");

  // Idempotente — reler de novo não lança nem regride o status.
  const segundaReleitura = await puzzleInstanceService.obterParaPersonagem(instancia.id, personagem.id);
  assert.equal(segundaReleitura.status, "EXPIRED");
});

testeComBanco("criarOuObterInstancia expira a existente vencida e cria uma nova em vez de devolver a morta", async () => {
  const { edicao, blueprintA } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia: primeira } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  await PuzzleInstance.update({ expires_at: new Date(Date.now() - 1000) }, { where: { id: primeira.id } });

  const { instancia: segunda, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true);
  assert.notEqual(segunda.id, primeira.id);
  const primeiraAtualizada = await PuzzleInstance.findByPk(primeira.id);
  assert.equal(primeiraAtualizada.status, "EXPIRED");
});

// -----------------------------------------------------------------------
// 4. Abandono voluntário.
// -----------------------------------------------------------------------

testeComBanco("abandonar: CREATED/ACTIVE vira ABANDONED; dono errado 404; instância terminal 409", async () => {
  const { edicao, blueprintA } = await sequelize.transaction((t) => criarFundacaoComDuasSalas(t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { personagem: outroPersonagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintA.id, {
    id: personagem.id,
    nome: personagem.nome,
  });

  await assert.rejects(
    () => puzzleInstanceService.abandonar(instancia.id, outroPersonagem.id, instancia.state_version),
    (err) => {
      assert.equal(err.statusCode, 404);
      return true;
    },
  );

  const abandonada = await puzzleInstanceService.abandonar(instancia.id, personagem.id, instancia.state_version);
  assert.equal(abandonada.status, "ABANDONED");

  await assert.rejects(
    () => puzzleInstanceService.abandonar(instancia.id, personagem.id, abandonada.state_version),
    (err) => {
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, "INSTANCIA_FINALIZADA");
      return true;
    },
  );
});

// -----------------------------------------------------------------------
// 5. PROVA FINAL — a migration de conteúdo real produz um evento que um
//    personagem resolve de ponta a ponta, na ordem certa, usando as
//    golden solutions reais de cada domínio (Fases 3/5/6/7).
// -----------------------------------------------------------------------

const GOLDEN_POR_SALA = {
  "oficina-dos-eixos": [
    { type: "LIGAR", componentId: "motor1" },
    { type: "ENGATAR", componentId: "clutch1" },
    { type: "ACIONAR", componentId: "lever1" },
  ],
  observatorio: [
    { type: "LIGAR", componentId: "emitter1" },
    { type: "ABRIR", componentId: "shutter1" },
  ],
  "sala-das-mares": [
    { type: "LIGAR", componentId: "pump1" },
    { type: "ABRIR", componentId: "valve1" },
  ],
  "nucleo-da-convergencia": [
    { type: "LIGAR", componentId: "motor1" },
    { type: "ENGATAR", componentId: "clutch1" },
    { type: "LIGAR", componentId: "emitter1" },
    { type: "ABRIR", componentId: "shutter1" },
    { type: "LIGAR", componentId: "pump1" },
    { type: "ABRIR", componentId: "valve1" },
  ],
};
const ORDEM_SALAS = ["oficina-dos-eixos", "observatorio", "sala-das-mares", "nucleo-da-convergencia"];

testeComBanco("conteúdo real (migration Fase 12): um personagem resolve as 4 salas em ordem, bloqueado até concluir a anterior", async () => {
  await migrationConteudo.down(sequelize.getQueryInterface()).catch(() => {});
  await migrationConteudo.up(sequelize.getQueryInterface());

  const { PuzzleBlueprint } = require("../src/models/eventPuzzleModels");
  const EventDefinitionModel = require("../src/models/eventPuzzleModels").EventDefinition;
  const EventEditionModel = require("../src/models/eventPuzzleModels").EventEdition;
  const definicao = await EventDefinitionModel.findOne({ where: { key: "coracao-da-maquina-celestial" } });
  const edicao = await EventEditionModel.findOne({ where: { id_event_definition: definicao.id, status: "ACTIVE" } });
  const blueprintsPorKey = {};
  for (const key of ORDEM_SALAS) {
    blueprintsPorKey[key] = await PuzzleBlueprint.findOne({ where: { id_event_definition: definicao.id, key } });
  }

  const { personagem } = await criarPersonagem({ nivel: 10 });

  for (let i = 0; i < ORDEM_SALAS.length; i++) {
    const key = ORDEM_SALAS[i];
    const blueprint = blueprintsPorKey[key];

    // Listagem pública reflete o progresso real ANTES de tentar entrar.
    const listagem = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
    const entradaDaSala = listagem.find((s) => s.key === key);
    assert.equal(entradaDaSala.bloqueado, false, `sala "${key}" devia estar desbloqueada na posição ${i}`);
    assert.ok(entradaDaSala.layout, `sala "${key}" desbloqueada precisa vir com layout`);

    const proximaKey = ORDEM_SALAS[i + 1];
    if (proximaKey) {
      const entradaDaProxima = listagem.find((s) => s.key === proximaKey);
      assert.equal(entradaDaProxima.bloqueado, true, `sala "${proximaKey}" não devia estar desbloqueada ainda`);
      assert.equal(entradaDaProxima.layout, undefined);
    }

    const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
      id: personagem.id,
      nome: personagem.nome,
    });
    let atual = instancia;
    for (const acao of GOLDEN_POR_SALA[key]) {
      const { instancia: atualizada } = await puzzleActionService.executarAcao(atual.id, personagem.id, acao, atual.state_version);
      atual = atualizada;
    }
    assert.equal(atual.status, "COMPLETED", `sala "${key}" devia terminar COMPLETED com a golden solution`);
  }

  // Depois de tudo resolvido, nenhuma sala continua bloqueada.
  const listagemFinal = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
  assert.ok(listagemFinal.every((s) => s.bloqueado === false));
});
