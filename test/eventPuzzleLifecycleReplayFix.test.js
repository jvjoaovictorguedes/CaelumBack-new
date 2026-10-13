// Evento "O Coração da Máquina Celestial" — correção de lifecycle/UX
// ("sala concluída recomeça"). Cobre literalmente a matriz da seção 25
// da encomenda: nenhuma instância→cria; CREATED/ACTIVE→idempotente;
// COMPLETED+replayable (ausente/false/true)→bloqueia/permite; v1
// replayable=false concluída + v2 replayable=true publicada→libera;
// listagem autoritativa (`concluido`/`em_andamento`/`id_instancia_ativa`
// /`replayable`); pré-requisito continua liberando; consulta de sala
// concluída nunca reabre completed_at/reward/Pioneer; concorrência real
// via Promise.allSettled (nunca simulada) tanto pós-COMPLETED quanto
// sem nenhuma instância anterior.
//
// NÃO cobre Puzzle Engine (fases 2-7, intocado nesta correção) nem
// GEAR_SLOT/espelhos avançados/válvulas graduais (fora de escopo —
// seção 27).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const { PuzzleInstance } = require("../src/models/eventPuzzleModels");
const { CharacterPuzzleRewardGrant } = require("../src/models/eventPuzzleRewardModels");
const { PuzzlePioneerClaim } = require("../src/models/eventPuzzleModels");

const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleInstanceService = require("../src/services/puzzleInstanceService");
const puzzleActionService = require("../src/services/puzzleActionService");
const puzzleRewardService = require("../src/services/puzzleRewardService");
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

// Fixture mínima de 1 objective, sempre resolvível com uma única ação
// (LIGAR motor1) — igual à de puzzleActionService.test.js/
// eventPuzzleRewardFase14.test.js, só com `replayable` opcional.
function configSimples({ objectiveId = "obj1", replayable } = {}) {
  return {
    dominio: "MECANICO",
    ...(replayable !== undefined ? { replayable } : {}),
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" }, position: { x: 0, y: 0 } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 1, y: 0 } },
    ],
    connections: [{ id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } }],
    objectives: [{ id: objectiveId, descricao: "Ligar o motor", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } }],
  };
}

const LIGAR_MOTOR = { type: "LIGAR", componentId: "motor1" };

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

// Resolve a sala de ponta a ponta (CREATED→ACTIVE→COMPLETED) com a
// golden solution de 1 ação — devolve a instância final COMPLETED.
async function resolverSala(edicao, blueprint, personagem) {
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  const { instancia: final } = await puzzleActionService.executarAcao(instancia.id, personagem.id, LIGAR_MOTOR, instancia.state_version);
  return final;
}

// -----------------------------------------------------------------------
// 1-3. Fluxo básico: nenhuma instância → cria; CREATED/ACTIVE idempotente.
// -----------------------------------------------------------------------

testeComBanco("1. sem nenhuma instância prévia: criarOuObterInstancia cria uma nova (CREATED)", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true);
  assert.equal(instancia.status, "CREATED");
});

testeComBanco("2. CREATED existente: criarOuObterInstancia devolve a MESMA instância, nunca cria outra", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia: i1 } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(i1.status, "CREATED");
  const { instancia: i2, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, false);
  assert.equal(i2.id, i1.id);
  const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
  assert.equal(total, 1);
});

testeComBanco("3. ACTIVE existente: criarOuObterInstancia devolve a MESMA instância, nunca cria outra", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  // 1 ação ativa (CREATED→ACTIVE) sem ainda resolver o objective — usa
  // uma ação "neutra" que não liga o motor (DESLIGAR, no-op de status)
  // pra garantir ACTIVE sem completar.
  await puzzleActionService.executarAcao(instancia.id, personagem.id, { type: "DESLIGAR", componentId: "motor1" }, instancia.state_version);
  const recarregada = await PuzzleInstance.findByPk(instancia.id);
  assert.equal(recarregada.status, "ACTIVE");

  const { instancia: i2, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, false);
  assert.equal(i2.id, instancia.id);
  assert.equal(i2.status, "ACTIVE");
  const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
  assert.equal(total, 1);
});

// -----------------------------------------------------------------------
// 4-6. COMPLETED + replayable (ausente/false/true).
// -----------------------------------------------------------------------

testeComBanco("4. COMPLETED + replayable ausente no config: default false → PUZZLE_JA_CONCLUIDO (409)", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const completa = await resolverSala(edicao, blueprint, personagem);
  assert.equal(completa.status, "COMPLETED");

  await assert.rejects(
    () => puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    (e) => {
      assert.equal(e.statusCode, 409);
      assert.equal(e.code, "PUZZLE_JA_CONCLUIDO");
      return true;
    },
  );
  const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
  assert.equal(total, 1, "nenhuma 2ª instância nasceu");
});

testeComBanco("5. COMPLETED + replayable=false explícito: não cria nova (409 PUZZLE_JA_CONCLUIDO)", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples({ replayable: false }), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await resolverSala(edicao, blueprint, personagem);

  await assert.rejects(
    () => puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    (e) => e.statusCode === 409 && e.code === "PUZZLE_JA_CONCLUIDO",
  );
  const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
  assert.equal(total, 1);
});

testeComBanco("6. COMPLETED + replayable=true: permite nova tentativa", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples({ replayable: true }), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const primeira = await resolverSala(edicao, blueprint, personagem);
  assert.equal(primeira.status, "COMPLETED");

  const { instancia: segunda, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true, "replayable=true libera uma nova PuzzleInstance de verdade");
  assert.notEqual(segunda.id, primeira.id);
  assert.equal(segunda.status, "CREATED");

  const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
  assert.equal(total, 2, "a COMPLETED original nunca é apagada nem reaproveitada — histórico + nova tentativa");

  const original = await PuzzleInstance.findByPk(primeira.id);
  assert.equal(original.status, "COMPLETED", "a COMPLETED original nunca muda de status");
});

// -----------------------------------------------------------------------
// 7. Fonte de verdade de replayable: SEMPRE a última version PUBLISHED
//    no momento da nova tentativa, nunca a config antiga da COMPLETED.
// -----------------------------------------------------------------------

testeComBanco(
  "7. v1 replayable=false concluída + Admin publica v2 replayable=true → nova tentativa passa a ser permitida",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples({ replayable: false }), t));
    const { personagem } = await criarPersonagem({ nivel: 5 });
    const v1Completa = await resolverSala(edicao, blueprint, personagem);
    assert.equal(v1Completa.status, "COMPLETED");

    // ainda bloqueado — só existe a v1 (replayable:false)
    await assert.rejects(
      () => puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
      (e) => e.statusCode === 409 && e.code === "PUZZLE_JA_CONCLUIDO",
    );

    // Admin publica v2 com replayable:true
    const v2 = await puzzleBlueprintService.criarNovaVersao(blueprint.id, { config: configSimples({ replayable: true }) });
    await puzzleBlueprintService.transicionar(v2.id, "PUBLISHED");

    const { instancia: nova, criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
      id: personagem.id,
      nome: personagem.nome,
    });
    assert.equal(criada, true, "a v2 PUBLISHED (replayable:true) é a fonte de verdade agora, nunca a config antiga da COMPLETED (v1)");
    assert.equal(nova.id_blueprint_version, v2.id, "a nova tentativa usa a versão PUBLISHED atual (v2)");
  },
);

// -----------------------------------------------------------------------
// 8-9. Listagem pública autoritativa.
// -----------------------------------------------------------------------

testeComBanco("8. listarPublicosPorEdicao: sala concluída vem com concluido=true + completed_at preenchido", async () => {
  const { definicao, edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const antes = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
  assert.equal(antes[0].concluido, false);
  assert.equal(antes[0].em_andamento, false);
  assert.equal(antes[0].id_instancia_ativa, null);
  assert.equal(antes[0].replayable, false);

  await resolverSala(edicao, blueprint, personagem);

  const depois = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
  assert.equal(depois[0].concluido, true);
  assert.ok(depois[0].completed_at, "completed_at precisa vir preenchido na listagem");
  assert.equal(depois[0].em_andamento, false, "uma sala concluída nunca aparece como em_andamento");
  assert.equal(depois[0].id_instancia_ativa, null);
});

testeComBanco("9. listarPublicosPorEdicao: tentativa ativa (CREATED/ACTIVE) reflete em_andamento + id_instancia_ativa", async () => {
  const { definicao, edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });

  const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
    id: personagem.id,
    nome: personagem.nome,
  });

  const listagem = await puzzleBlueprintService.listarPublicosPorEdicao(definicao.id, edicao.id, personagem.id);
  assert.equal(listagem[0].em_andamento, true);
  assert.equal(listagem[0].id_instancia_ativa, instancia.id);
  assert.equal(listagem[0].concluido, false);
});

// -----------------------------------------------------------------------
// 10. Pré-requisito continua liberado por uma COMPLETED — a nova lógica
//     de bloqueio de replay nunca quebra a progressão normal entre
//     salas distintas (replay é dentro do MESMO blueprint; progressão é
//     entre blueprints DIFERENTES — nunca confundir os dois).
// -----------------------------------------------------------------------

testeComBanco("10. conclusão da sala A continua liberando a sala B (pré-requisito) mesmo com o novo guard de replay", async () => {
  const chave = slug();
  const { definicao, edicao } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));

  const { blueprint: blueprintB, versao: versaoB } = await puzzleBlueprintService.criarBlueprint(definicao.id, {
    key: `sala-b-${chave}`,
    nome: "Sala B",
    ordem: 2,
  });
  await puzzleBlueprintService.atualizarDraft(versaoB.id, { config: configSimples({ objectiveId: "obj_b" }) });
  await puzzleBlueprintService.transicionar(versaoB.id, "PUBLISHED");
  await puzzleBlueprintService.atualizarBlueprint(blueprintB.id, {});

  const blueprintA = await require("../src/models/eventPuzzleModels").PuzzleBlueprint.findOne({
    where: { id_event_definition: definicao.id, ordem: 0 },
  });
  await require("../src/models/eventPuzzleModels").PuzzleBlueprint.update(
    { id_blueprint_prerequisito: blueprintA.id },
    { where: { id: blueprintB.id } },
  );

  const { personagem } = await criarPersonagem({ nivel: 5 });

  await assert.rejects(
    () => puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintB.id, { id: personagem.id, nome: personagem.nome }),
    (e) => e.statusCode === 409 && e.code === "PRE_REQUISITO_PENDENTE",
  );

  await resolverSala(edicao, blueprintA, personagem);

  const { criada } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprintB.id, {
    id: personagem.id,
    nome: personagem.nome,
  });
  assert.equal(criada, true, "COMPLETED da sala A libera a sala B normalmente");
});

// -----------------------------------------------------------------------
// 11-13. Consultar uma sala concluída nunca tem efeito colateral.
// -----------------------------------------------------------------------

testeComBanco("11. consultar/tentar reentrar numa sala concluída nunca altera completed_at nem o state final", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const completa = await resolverSala(edicao, blueprint, personagem);
  const completedAtOriginal = completa.completed_at.getTime();
  const stateOriginal = JSON.stringify(completa.state);

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() =>
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    );
    await puzzleInstanceService.obterParaPersonagem(completa.id, personagem.id);
  }

  const recarregada = await PuzzleInstance.findByPk(completa.id);
  assert.equal(recarregada.completed_at.getTime(), completedAtOriginal, "completed_at nunca muda numa consulta");
  assert.equal(JSON.stringify(recarregada.state), stateOriginal, "o state final nunca muda numa consulta");
  assert.equal(recarregada.status, "COMPLETED");
});

testeComBanco("12. consultar/tentar reentrar numa sala concluída nunca concede reward novamente", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  await puzzleRewardService.criarDefinicao(blueprint.id, {
    key: "recompensa-lifecycle",
    tituloExibicao: "Recompensa",
    descricaoExibicao: "Descrição",
    triggerType: "INSTANCE_COMPLETED",
    rewardOuro: 10,
    rewardXp: 5,
  });
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await resolverSala(edicao, blueprint, personagem);

  const grantsApos1aConclusao = await CharacterPuzzleRewardGrant.count({ where: { id_personagem: personagem.id } });
  assert.equal(grantsApos1aConclusao, 1);

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() =>
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    );
  }

  const grantsFinal = await CharacterPuzzleRewardGrant.count({ where: { id_personagem: personagem.id } });
  assert.equal(grantsFinal, 1, "nenhuma concessão extra só por consultar/tentar reentrar numa sala já concluída");
});

testeComBanco("13. consultar/tentar reentrar numa sala concluída nunca gera um novo Pioneer claim", async () => {
  const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
  const marco = await puzzlePioneerService.criarMilestone(blueprint.id, {
    key: "pioneiro-lifecycle",
    titulo: "Pioneiro",
    descricao: "Primeiro a resolver",
    triggerType: "INSTANCE_COMPLETED",
    maxClaims: 3,
  });
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await resolverSala(edicao, blueprint, personagem);

  const claimsApos1aConclusao = await PuzzlePioneerClaim.count({ where: { id_milestone: marco.id } });
  assert.equal(claimsApos1aConclusao, 1);

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() =>
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    );
  }

  const claimsFinal = await PuzzlePioneerClaim.count({ where: { id_milestone: marco.id } });
  assert.equal(claimsFinal, 1, "nenhum claim extra só por consultar/tentar reentrar numa sala já concluída");
});

// -----------------------------------------------------------------------
// 14-15. Concorrência REAL (Promise.allSettled, nunca simulada).
// -----------------------------------------------------------------------

testeComBanco(
  "14. 2 chamadas concorrentes de criarOuObterInstancia depois de COMPLETED/replayable=false: ZERO novas instâncias",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples({ replayable: false }), t));
    const { personagem } = await criarPersonagem({ nivel: 5 });
    await resolverSala(edicao, blueprint, personagem);

    const resultados = await Promise.allSettled([
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    ]);

    assert.ok(resultados.every((r) => r.status === "rejected"), "as 2 chamadas concorrentes são rejeitadas");
    for (const r of resultados) {
      assert.equal(r.reason.statusCode, 409);
      assert.equal(r.reason.code, "PUZZLE_JA_CONCLUIDO");
    }

    const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
    assert.equal(total, 1, "só a COMPLETED original existe — nenhuma das 2 chamadas concorrentes criou nada");
  },
);

testeComBanco(
  "15. 2 chamadas concorrentes de criarOuObterInstancia SEM nenhuma instância anterior: no máximo 1 tentativa ativa nasce",
  async () => {
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configSimples(), t));
    const { personagem } = await criarPersonagem({ nivel: 5 });

    const resultados = await Promise.allSettled([
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
      puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, { id: personagem.id, nome: personagem.nome }),
    ]);

    const sucessos = resultados.filter((r) => r.status === "fulfilled");
    assert.equal(sucessos.length, 2, "idempotência real — as 2 terminam com sucesso, nunca erro de corrida");
    assert.equal(sucessos[0].value.instancia.id, sucessos[1].value.instancia.id, "as 2 apontam pra MESMA instância");

    const criadas = sucessos.filter((r) => r.value.criada === true);
    assert.equal(criadas.length, 1, "exatamente 1 das 2 chamadas de fato cria; a outra recupera");

    const total = await PuzzleInstance.count({ where: { id_event_edition: edicao.id } });
    assert.equal(total, 1, "nunca 2 PuzzleInstances ativas pro mesmo personagem+blueprint+edição");
  },
);

// -----------------------------------------------------------------------
// Extra — wiring ponta a ponta do DTO progressivo de objectives através
// do controller/service real (não só a função pura isolada — ver
// eventPuzzleFase12Conteudo.test.js pra essa).
// -----------------------------------------------------------------------

testeComBanco(
  "extra. criarOuObterInstancia (via service real) devolve objectivesProgressivos coerente com o progresso da Instance",
  async () => {
    const configDoisObjetivos = {
      dominio: "MECANICO",
      components: [
        { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" }, position: { x: 0, y: 0 } },
        { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 1, y: 0 } },
        { id: "lever1", type: "LEVER", props: {}, position: { x: 2, y: 0 } },
      ],
      connections: [{ id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } }],
      objectives: [
        { id: "obj_rotacao", descricao: "Segredo 1 — atingir rotação", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } },
        { id: "obj_alavanca", descricao: "Segredo 2 — acionar alavanca", condicao: { op: "EQUALS", path: "components.lever1.acionada", value: true } },
      ],
    };
    const { edicao, blueprint } = await sequelize.transaction((t) => criarFundacaoComDominio(configDoisObjetivos, t));
    const { personagem } = await criarPersonagem({ nivel: 5 });

    const { instancia } = await puzzleInstanceService.criarOuObterInstancia(edicao.id, blueprint.id, {
      id: personagem.id,
      nome: personagem.nome,
    });
    const instanciaComBlueprint = await puzzleInstanceService.obterParaPersonagem(instancia.id, personagem.id, { comBlueprint: true });
    const dtoInicial = puzzleInstanceService.dtoRuntimeComObjetivos(
      instanciaComBlueprint,
      instanciaComBlueprint.blueprintVersion.config.objectives,
    );
    assert.equal(dtoInicial.objectivesProgressivos[0].atual, true);
    assert.equal(dtoInicial.objectivesProgressivos[0].descricao, "Segredo 1 — atingir rotação");
    assert.ok(!("descricao" in dtoInicial.objectivesProgressivos[1]), "2º objective nunca revela a descrição antes da hora");
    assert.ok(!JSON.stringify(dtoInicial).includes("Segredo 2"), "a string da 2ª descrição nunca atravessa o DTO inicial");

    const { instancia: instanciaAtualizada, config } = await puzzleActionService.executarAcao(
      instancia.id,
      personagem.id,
      LIGAR_MOTOR,
      instancia.state_version,
    );
    const dtoDepois = puzzleInstanceService.dtoRuntimeComObjetivos(instanciaAtualizada, config.objectives);
    assert.equal(dtoDepois.objectivesProgressivos[0].concluido, true);
    assert.equal(dtoDepois.objectivesProgressivos[1].atual, true);
    assert.equal(dtoDepois.objectivesProgressivos[1].descricao, "Segredo 2 — acionar alavanca");
  },
);

test.after(async () => {
  if (temBanco) await sequelize.close();
});
