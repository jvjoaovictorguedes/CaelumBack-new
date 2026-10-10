// Evento "O Coração da Máquina Celestial" — Fase 15 (Admin completo +
// validador de solvabilidade). Cobre as lacunas reais encontradas na
// auditoria pré-Fase-15: update/delete pra Blueprint/pistas/marcos/
// recompensas (bloqueando exclusão quando já existe histórico real do
// jogador), o dry-run de solvabilidade (sucesso real com a golden
// solution da Fase 12, e os 3 jeitos de falhar: domínio inválido,
// estrutura/topologia inválida, sequência que não resolve), e o CRUD
// completo do Custódio do Meridiano (config/fases/resistências).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const AdventureMonster = require("../src/models/AdventureMonster");
const { PuzzleBlueprint, PuzzleParticipant, PuzzleInstance, PuzzleBlueprintVersion } = require("../src/models/eventPuzzleModels");
const { PuzzleClueDefinition, CharacterClueUnlock } = require("../src/models/eventPuzzleModels");
const { PuzzlePioneerMilestone, PuzzlePioneerClaim } = require("../src/models/eventPuzzleModels");
const { PuzzleRewardDefinition, CharacterPuzzleRewardGrant } = require("../src/models/eventPuzzleRewardModels");
const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const puzzleClueService = require("../src/services/puzzleClueService");
const puzzlePioneerService = require("../src/services/puzzlePioneerService");
const puzzleRewardService = require("../src/services/puzzleRewardService");
const eventPuzzleBossAdminService = require("../src/services/eventPuzzleBossAdminService");

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

function configSimples(objectiveId = "obj1") {
  return {
    dominio: "MECANICO",
    components: [
      { id: "motor1", type: "MOTOR", props: { rpmNominal: 60, sentido: "CW" }, position: { x: 0, y: 0 } },
      { id: "output1", type: "OUTPUT", props: { rpmAlvo: 60, sentidoAlvo: "CW", toleranciaRpm: 0 }, position: { x: 1, y: 0 } },
    ],
    connections: [{ id: "c1", from: { componentId: "motor1", port: "out" }, to: { componentId: "output1", port: "in" } }],
    objectives: [{ id: objectiveId, descricao: "Ligar o motor", condicao: { op: "EQUALS", path: "components.output1.atingido", value: true } }],
  };
}

async function criarFundacaoComBlueprint({ comVersaoPublicada = true } = {}) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: `Edição ${chave}` });
  await eventEditionService.transicionar(edicao.id, "ACTIVE");

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, { key: `sala-${chave}`, nome: "Sala", ordem: 1 });
  await puzzleBlueprintService.atualizarDraft(versao.id, { config: configSimples("obj1") });
  const versaoFinal = comVersaoPublicada ? await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {}) : versao;

  return { definicao, edicao, blueprint, versao: versaoFinal };
}

async function criarMonstroBase(overrides = {}) {
  return AdventureMonster.create({
    nome: `Custódio Admin Teste ${sufixo()}`,
    nivel: 50,
    vida_maxima: 1000,
    dano_min: 40,
    dano_max: 60,
    defesa: 10,
    ai_profile: "BOSS",
    disponivel_emboscada: false,
    ...overrides,
  });
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});

// ----------------------------------------------------- PuzzleBlueprint

testeComBanco("atualizarBlueprint: edita nome/ordem e rejeita pré-requisito de si mesmo", async () => {
  const { blueprint } = await criarFundacaoComBlueprint();
  const atualizado = await puzzleBlueprintService.atualizarBlueprint(blueprint.id, { nome: "Novo Nome", ordem: 5 });
  assert.equal(atualizado.nome, "Novo Nome");
  assert.equal(atualizado.ordem, 5);

  await assert.rejects(
    () => puzzleBlueprintService.atualizarBlueprint(blueprint.id, { id_blueprint_prerequisito: blueprint.id }),
    /não pode ser pré-requisito de si mesmo/,
  );
});

testeComBanco("atualizarBlueprint: rejeita pré-requisito de outro evento", async () => {
  const { blueprint } = await criarFundacaoComBlueprint();
  const { blueprint: blueprintOutroEvento } = await criarFundacaoComBlueprint();
  await assert.rejects(
    () => puzzleBlueprintService.atualizarBlueprint(blueprint.id, { id_blueprint_prerequisito: blueprintOutroEvento.id }),
    /mesmo evento/,
  );
});

// ------------------------------------------------- Solvabilidade (dry-run)

testeComBanco("validarSolvabilidade: sequência real resolve e grava a assinatura", async () => {
  const { versao } = await criarFundacaoComBlueprint({ comVersaoPublicada: false });
  const resultado = await puzzleBlueprintService.validarSolvabilidade(versao.id, { acoes: [{ type: "LIGAR", componentId: "motor1" }] });
  assert.equal(resultado.valido, true);
  assert.ok(resultado.assinatura);

  await versao.reload();
  assert.equal(versao.solvability_signature, resultado.assinatura);
  assert.ok(versao.solvability_validated_at);
});

testeComBanco("validarSolvabilidade: config com dominio inválido falha na etapa DOMINIO", async () => {
  const { versao } = await criarFundacaoComBlueprint({ comVersaoPublicada: false });
  await puzzleBlueprintService.atualizarDraft(versao.id, { config: { ...configSimples(), dominio: "NAO_EXISTE" } });
  const resultado = await puzzleBlueprintService.validarSolvabilidade(versao.id, { acoes: [{ type: "LIGAR", componentId: "motor1" }] });
  assert.equal(resultado.valido, false);
  assert.equal(resultado.etapa, "DOMINIO");
});

testeComBanco("validarSolvabilidade: ação referenciando componente inexistente falha na etapa SIMULACAO", async () => {
  const { versao } = await criarFundacaoComBlueprint({ comVersaoPublicada: false });
  const resultado = await puzzleBlueprintService.validarSolvabilidade(versao.id, { acoes: [{ type: "LIGAR", componentId: "nao-existe" }] });
  assert.equal(resultado.valido, false);
  assert.equal(resultado.etapa, "SIMULACAO");
  assert.equal(resultado.indiceFalha, 0);
});

testeComBanco("validarSolvabilidade: sequência vazia de ações que não resolve nada reporta OBJETIVOS_INCOMPLETOS", async () => {
  const { versao } = await criarFundacaoComBlueprint({ comVersaoPublicada: false });
  // DESLIGAR não resolve o objetivo (motor nunca liga) — simulação roda
  // até o fim sem erro, mas objetivosConcluidos nunca preenche.
  const resultado = await puzzleBlueprintService.validarSolvabilidade(versao.id, { acoes: [{ type: "DESLIGAR", componentId: "motor1" }] });
  assert.equal(resultado.valido, false);
  assert.equal(resultado.etapa, "OBJETIVOS_INCOMPLETOS");
});

testeComBanco("validarSolvabilidade: rejeita sem nenhuma ação informada", async () => {
  const { versao } = await criarFundacaoComBlueprint({ comVersaoPublicada: false });
  await assert.rejects(() => puzzleBlueprintService.validarSolvabilidade(versao.id, { acoes: [] }), /sequência candidata/);
});

// --------------------------------------------------- PuzzleClueDefinition

testeComBanco("atualizarDefinicao (pista): edita título/texto; excluirDefinicao bloqueia se já desbloqueada", async () => {
  const { blueprint } = await criarFundacaoComBlueprint();
  const { personagem } = await criarPersonagem({});
  const pista = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-teste", titulo: "Título Original", texto: "Texto original", triggerType: "INSTANCE_COMPLETED",
  });

  const atualizada = await puzzleClueService.atualizarDefinicao(pista.id, { titulo: "Título Editado" });
  assert.equal(atualizada.titulo, "Título Editado");

  await puzzleClueService.excluirDefinicao(pista.id); // ainda ninguém desbloqueou — permitido.

  const pista2 = await puzzleClueService.criarDefinicao(blueprint.id, {
    key: "pista-teste-2", titulo: "Outra", texto: "Outro texto", triggerType: "INSTANCE_COMPLETED",
  });
  await CharacterClueUnlock.create({ id_personagem: personagem.id, id_clue_definition: pista2.id });
  await assert.rejects(() => puzzleClueService.excluirDefinicao(pista2.id), /já foi desbloqueada/);
});

// -------------------------------------------------- PuzzlePioneerMilestone

testeComBanco(
  "atualizarMilestone: rejeita maxClaims abaixo do já conquistado; excluirMilestone bloqueia se já conquistado",
  async () => {
    const { blueprint } = await criarFundacaoComBlueprint();
    const { personagem: p1 } = await criarPersonagem({});
    const { personagem: p2 } = await criarPersonagem({});
    const marco = await puzzlePioneerService.criarMilestone(blueprint.id, {
      key: "marco-teste", titulo: "Marco", descricao: "Descrição", triggerType: "INSTANCE_COMPLETED", maxClaims: 3,
    });

    await PuzzlePioneerClaim.create({ id_milestone: marco.id, id_personagem: p1.id, personagem_nome_snapshot: p1.nome, posicao: 1 });
    await PuzzlePioneerClaim.create({ id_milestone: marco.id, id_personagem: p2.id, personagem_nome_snapshot: p2.nome, posicao: 2 });

    // maxClaims=0 nem chega a comparar com o total conquistado — falha
    // antes, na validação genérica de inteiro >= 1.
    await assert.rejects(() => puzzlePioneerService.atualizarMilestone(marco.id, { maxClaims: 0 }), /maxClaims precisa ser um inteiro/);
    // maxClaims=1 é um inteiro válido, mas já foram conquistados 2 — aqui
    // sim exercita o 409 "abaixo do já conquistado".
    await assert.rejects(() => puzzlePioneerService.atualizarMilestone(marco.id, { maxClaims: 1 }), /não pode ser menor que o total já conquistado/);

    const editado = await puzzlePioneerService.atualizarMilestone(marco.id, { titulo: "Marco Editado" });
    assert.equal(editado.titulo, "Marco Editado");

    await assert.rejects(() => puzzlePioneerService.excluirMilestone(marco.id), /já tem pelo menos uma conquista/);
  },
);

// ------------------------------------------------- PuzzleRewardDefinition

testeComBanco(
  "atualizarDefinicao (recompensa): rejeita remover o único reward configurado; excluirDefinicao bloqueia se já concedida",
  async () => {
    const { blueprint } = await criarFundacaoComBlueprint();
    const { personagem } = await criarPersonagem({});
    const recompensa = await puzzleRewardService.criarDefinicao(blueprint.id, {
      key: "recompensa-teste", tituloExibicao: "Recompensa", descricaoExibicao: "x", triggerType: "INSTANCE_COMPLETED", rewardOuro: 10,
    });

    await assert.rejects(
      () => puzzleRewardService.atualizarDefinicao(recompensa.id, { rewardOuro: 0 }),
      /pelo menos um de/,
    );

    const editada = await puzzleRewardService.atualizarDefinicao(recompensa.id, { rewardOuro: 20, tituloExibicao: "Recompensa Editada" });
    assert.equal(editada.reward_ouro, 20);
    assert.equal(editada.titulo_exibicao, "Recompensa Editada");

    await CharacterPuzzleRewardGrant.create({ id_personagem: personagem.id, id_reward_definition: recompensa.id });
    await assert.rejects(() => puzzleRewardService.excluirDefinicao(recompensa.id), /já foi concedida/);
  },
);

// ---------------------------------------------- EventPuzzleBossConfig (CRUD)

testeComBanco("eventPuzzleBossAdminService: upsert do config, fases e resistências (CRUD completo)", async () => {
  const { definicao, blueprint } = await criarFundacaoComBlueprint();
  const monstro = await criarMonstroBase();

  const config = await eventPuzzleBossAdminService.salvarConfig(definicao.id, {
    id_monstro_base: monstro.id,
    id_blueprint_gatilho: blueprint.id,
    nome_exibicao: "Custódio",
    reward_ouro_primeira_vitoria: 500,
  }, { idAdmin: 1, req: null });
  assert.equal(config.id_monstro_base, monstro.id);
  assert.equal(config.id_blueprint_gatilho, blueprint.id);

  // upsert — chamar de novo com dados parciais preserva o que não foi enviado.
  const configAtualizado = await eventPuzzleBossAdminService.salvarConfig(definicao.id, {
    id_monstro_base: monstro.id,
    reward_ouro_primeira_vitoria: 777,
  }, { idAdmin: 1, req: null });
  assert.equal(configAtualizado.id, config.id, "upsert — nunca cria uma segunda linha");
  assert.equal(configAtualizado.reward_ouro_primeira_vitoria, 777);
  assert.equal(configAtualizado.nome_exibicao, "Custódio", "campo não enviado preserva o valor anterior");

  const fase = await eventPuzzleBossAdminService.criarFase(definicao.id, { hp_threshold_pct: 50, nome_exibicao: "Fase 2" }, { idAdmin: 1, req: null });
  const faseEditada = await eventPuzzleBossAdminService.atualizarFase(definicao.id, fase.id, { dano_multiplicador: 1.5 }, { idAdmin: 1, req: null });
  assert.equal(faseEditada.dano_multiplicador, 1.5);
  await eventPuzzleBossAdminService.excluirFase(definicao.id, fase.id, { idAdmin: 1, req: null });

  const resistencia = await eventPuzzleBossAdminService.criarResistencia(definicao.id, { status_key: "STUN", imune: true }, { idAdmin: 1, req: null });
  await assert.rejects(
    () => eventPuzzleBossAdminService.criarResistencia(definicao.id, { status_key: "STUN" }, { idAdmin: 1, req: null }),
    /Já existe uma resistência/,
  );
  const resistenciaEditada = await eventPuzzleBossAdminService.atualizarResistencia(definicao.id, resistencia.id, { resistencia_pct: 50 }, { idAdmin: 1, req: null });
  assert.equal(resistenciaEditada.resistencia_pct, 50);
  await eventPuzzleBossAdminService.excluirResistencia(definicao.id, resistencia.id, { idAdmin: 1, req: null });

  const { config: configFinal, fases, resistencias } = await eventPuzzleBossAdminService.obterConfigAdmin(definicao.id);
  assert.equal(configFinal.id, config.id);
  assert.equal(fases.length, 0);
  assert.equal(resistencias.length, 0);
});

testeComBanco("eventPuzzleBossAdminService: rejeita id_blueprint_gatilho de outro evento e bloqueia edição com EventDefinition arquivada", async () => {
  const { definicao, edicao } = await criarFundacaoComBlueprint();
  const { blueprint: blueprintOutroEvento } = await criarFundacaoComBlueprint();
  const monstro = await criarMonstroBase();

  await assert.rejects(
    () => eventPuzzleBossAdminService.salvarConfig(definicao.id, { id_monstro_base: monstro.id, id_blueprint_gatilho: blueprintOutroEvento.id }, { idAdmin: 1, req: null }),
    /mesmo evento/,
  );

  await eventPuzzleBossAdminService.salvarConfig(definicao.id, { id_monstro_base: monstro.id }, { idAdmin: 1, req: null });
  // precisa encerrar a edição ACTIVE antes de arquivar a definição — ver
  // EDICOES_PENDENTES em eventDefinitionService.transicionar.
  await eventEditionService.transicionar(edicao.id, "ENDED");
  await eventDefinitionService.transicionar(definicao.id, "ARCHIVED");
  await assert.rejects(
    () => eventPuzzleBossAdminService.criarFase(definicao.id, { hp_threshold_pct: 50 }, { idAdmin: 1, req: null }),
    /arquivado/,
  );
});
