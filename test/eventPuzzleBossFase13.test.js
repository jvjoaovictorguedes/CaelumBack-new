// Evento "O Coração da Máquina Celestial" — Fase 13 (Boss Custódio do
// Meridiano). Clone estrutural dos testes do Guardião do Templo
// (test/templeBoss.test.js) — mesma cobertura: desbloqueio real
// (gatilho = personagemCompletouBlueprint, nunca um filtro de UI),
// snapshots congelados, resolução de turno via motores genéricos
// compartilhados, recompensa idempotente, derrota sem recompensa — mais
// um teste de ponta a ponta que roda as migrations reais da Fase 13
// contra o conteúdo real da Fase 12.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const AdventureMonster = require("../src/models/AdventureMonster");
const { EventEdition, PuzzleInstance, PuzzleParticipant } = require("../src/models/eventPuzzleModels");
const {
  EventPuzzleBossConfig,
  EventPuzzleBossAttempt,
  EventPuzzleBossRewardGrant,
} = require("../src/models/eventPuzzleBossModels");
const eventDefinitionService = require("../src/services/eventDefinitionService");
const eventEditionService = require("../src/services/eventEditionService");
const puzzleBlueprintService = require("../src/services/puzzleBlueprintService");
const eventPuzzleBossAttemptService = require("../src/services/eventPuzzleBossAttemptService");
const eventPuzzleBossCombatService = require("../src/services/eventPuzzleBossCombatService");
const migrationSchema = require("../src/migrations/20270214010003-event-puzzle-fase13-boss-schema.js");
const migrationConteudoBoss = require("../src/migrations/20270214010004-event-puzzle-fase13-boss-conteudo.js");

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

async function criarMonstroBase(overrides = {}) {
  return AdventureMonster.create({
    nome: `Custódio Teste ${sufixo()}`,
    nivel: 50,
    vida_maxima: 1000,
    dano_min: 40,
    dano_max: 60,
    agilidade: 0,
    velocidade: 0,
    defesa: 10,
    ai_profile: "BOSS",
    disponivel_emboscada: false,
    ...overrides,
  });
}

// Fundação mínima: EventDefinition PUBLISHED + EventEdition ACTIVE +
// 1 blueprint-gatilho PUBLISHED + EventPuzzleBossConfig ligado a ele —
// mesmo papel de criarEventoComBoss em templeBoss.test.js, só que
// composto fresco do banco (ver eventPuzzleBossAttemptService.js), nunca
// de um config_snapshot cacheado.
async function criarFundacaoComBoss({ rewardOuro = 500, rewardXp = 1000, statsMonstro = {} } = {}) {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-${chave}`, nome: `Evento ${chave}` });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: `Edição ${chave}` });
  await eventEditionService.transicionar(edicao.id, "ACTIVE");

  const { blueprint, versao } = await puzzleBlueprintService.criarBlueprint(definicao.id, {
    key: `gatilho-${chave}`,
    nome: "Sala Gatilho",
    ordem: 1,
  });
  await puzzleBlueprintService.atualizarDraft(versao.id, { config: configSimples("obj_gatilho") });
  const versaoPublicada = await puzzleBlueprintService.transicionar(versao.id, "PUBLISHED", {});

  const monstro = await criarMonstroBase(statsMonstro);
  const config = await EventPuzzleBossConfig.create({
    id_event_definition: definicao.id,
    id_monstro_base: monstro.id,
    id_blueprint_gatilho: blueprint.id,
    nome_exibicao: "Custódio Teste",
    lore: "Lore de teste",
    target_turns_to_kill: 8,
    target_boss_actions_survivable: 6,
    scaling_min_multiplier: 0.5,
    scaling_max_multiplier: 3,
    reward_ouro_primeira_vitoria: rewardOuro,
    reward_xp_primeira_vitoria: rewardXp,
  });

  return { definicao, edicao, blueprint, versao: versaoPublicada, monstro, config };
}

// Marca o personagem como tendo COMPLETED a sala-gatilho — mesmo efeito
// que puzzleActionService produziria ao fim da golden solution, sem
// precisar replicar o engine aqui (já coberto pela suíte da Fase 8/12).
async function completarGatilho(idEventEdition, idBlueprintVersion, personagem) {
  const instancia = await PuzzleInstance.create({
    id_event_edition: idEventEdition,
    id_blueprint_version: idBlueprintVersion,
    status: "COMPLETED",
    seed: `seed-${sufixo()}`,
    completed_at: new Date(),
  });
  await PuzzleParticipant.create({
    id_instance: instancia.id,
    id_personagem: personagem.id,
    personagem_nome_snapshot: personagem.nome,
  });
  return instancia;
}

// Força o boss a 1 de vida e tenta um ataque básico; esquiva tem piso de
// 5%, então repete em attempts frescos (destrói a anterior pra não
// colidir com o índice único de "uma Ativa por personagem+edição") até
// vencer ou esgotar as tentativas — mesmo padrão de templeBoss.test.js.
async function venceBossComUmGolpe(personagem, edicaoId) {
  for (let tentativa = 0; tentativa < 15; tentativa++) {
    const { attempt } = await sequelize.transaction((t) =>
      eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicaoId, t),
    );
    attempt.runtime_state.vida_atual_boss = 1;
    await attempt.save();
    const resultado = await eventPuzzleBossCombatService.resolverTurno(attempt, { tipo: "attack" });
    if (resultado.concluido === "Vitoria") return { attempt, resultado };
    await attempt.destroy();
  }
  throw new Error("não venceu em 15 tentativas (piso de esquiva é só 5%)");
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("obterStatusPublico: 'Nenhum' sem EventPuzzleBossConfig", async () => {
  const chave = slug();
  const definicao = await eventDefinitionService.criar({ key: `evento-vazio-${chave}`, nome: "Sem boss" });
  await eventDefinitionService.transicionar(definicao.id, "PUBLISHED");
  const edicao = await eventEditionService.criar(definicao.id, { key: `edicao-${chave}`, nome: "Edição" });
  await eventEditionService.transicionar(edicao.id, "ACTIVE");

  const status = await eventPuzzleBossAttemptService.obterStatusPublico(999999, edicao.id);
  assert.equal(status.status, "Nenhum");
});

testeComBanco("obterStatusPublico: desbloqueado só depois de completar a sala-gatilho", async () => {
  const { personagem } = await criarPersonagem({});
  const { edicao, versao } = await criarFundacaoComBoss();

  let status = await eventPuzzleBossAttemptService.obterStatusPublico(personagem.id, edicao.id);
  assert.equal(status.status, "Disponivel");
  assert.equal(status.desbloqueado, false);
  assert.equal(status.jaVenceu, false);

  await completarGatilho(edicao.id, versao.id, personagem);
  status = await eventPuzzleBossAttemptService.obterStatusPublico(personagem.id, edicao.id);
  assert.equal(status.desbloqueado, true);
});

testeComBanco("entrarOuRetomar: rejeita sem completar a sala-gatilho (GATILHO_PENDENTE)", async () => {
  const { personagem } = await criarPersonagem({});
  const { edicao } = await criarFundacaoComBoss();

  await assert.rejects(
    () => sequelize.transaction((t) => eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t)),
    (error) => {
      assert.equal(error.code, "GATILHO_PENDENTE");
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
});

testeComBanco(
  "entrarOuRetomar: cria attempt com snapshots congelados e resume (nunca duplica)",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 20 });
    const { edicao, versao } = await criarFundacaoComBoss();
    await completarGatilho(edicao.id, versao.id, personagem);

    const { attempt: primeiro, retomada: retomadaPrimeira } = await sequelize.transaction((t) =>
      eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
    );
    assert.equal(retomadaPrimeira, false);
    assert.equal(primeiro.status, "Ativa");
    assert.ok(primeiro.player_snapshot.vidaMax > 0);
    assert.ok(primeiro.boss_snapshot.stats.vida_maxima > 0);
    assert.equal(primeiro.runtime_state.vida_atual_boss, primeiro.boss_snapshot.stats.vida_maxima);

    const { attempt: segundo, retomada: retomadaSegunda } = await sequelize.transaction((t) =>
      eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
    );
    assert.equal(retomadaSegunda, true);
    assert.equal(segundo.id, primeiro.id);

    const total = await EventPuzzleBossAttempt.count({ where: { id_event_edition: edicao.id, character_id: personagem.id } });
    assert.equal(total, 1, "nunca duplica — uma única linha Ativa por personagem+edição");
  },
);

testeComBanco("resolverTurno: rejeita ação de item (Custódio não aceita consumível)", async () => {
  const { personagem } = await criarPersonagem({});
  const { edicao, versao } = await criarFundacaoComBoss();
  await completarGatilho(edicao.id, versao.id, personagem);
  const { attempt } = await sequelize.transaction((t) =>
    eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
  );

  await assert.rejects(() => eventPuzzleBossCombatService.resolverTurno(attempt, { tipo: "item" }), /não aceita consumíveis/);
});

testeComBanco("resolverTurno: rejeita poder inválido/não aprendido", async () => {
  const { personagem } = await criarPersonagem({});
  const { edicao, versao } = await criarFundacaoComBoss();
  await completarGatilho(edicao.id, versao.id, personagem);
  const { attempt } = await sequelize.transaction((t) =>
    eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
  );

  await assert.rejects(
    () => eventPuzzleBossCombatService.resolverTurno(attempt, { tipo: "power", idPoder: 999999 }),
    /Poder inválido/,
  );
});

testeComBanco("resolverTurno: ataque básico resolve os dois lados e avança o turno", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  const { edicao, versao } = await criarFundacaoComBoss();
  await completarGatilho(edicao.id, versao.id, personagem);
  const { attempt } = await sequelize.transaction((t) =>
    eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
  );

  const turnoAntes = attempt.runtime_state.combat_turn;
  const resultado = await eventPuzzleBossCombatService.resolverTurno(attempt, { tipo: "attack" });

  assert.ok(Array.isArray(resultado.log));
  assert.ok(resultado.log.length > 0);
  assert.ok(["Vitoria", "Derrota", null].includes(resultado.concluido));
  if (resultado.concluido === null) {
    assert.equal(resultado.runtime.combat_turn, turnoAntes + 1);
  }
});

testeComBanco(
  "primeira vitória concede ouro+xp exatamente uma vez, mesmo com retry do grant",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 50 });
    const { edicao, versao } = await criarFundacaoComBoss({ rewardOuro: 777, rewardXp: 321 });
    await completarGatilho(edicao.id, versao.id, personagem);

    const { attempt, resultado } = await venceBossComUmGolpe(personagem, edicao.id);

    const dinheiroAntes = personagem.dinheiro ?? 0;
    const primeiraRecompensa = await sequelize.transaction((t) => {
      attempt.runtime_state = resultado.runtime;
      return eventPuzzleBossAttemptService.finalizarVitoria(attempt, t);
    });
    assert.equal(primeiraRecompensa.ouroGanho, 777);
    assert.equal(primeiraRecompensa.xpGanho, 321);
    assert.equal(primeiraRecompensa.idempotente, false);

    await personagem.reload();
    assert.equal(personagem.dinheiro, dinheiroAntes + 777);

    const segundaRecompensa = await sequelize.transaction((t) => eventPuzzleBossAttemptService.finalizarVitoria(attempt, t));
    assert.equal(segundaRecompensa.idempotente, true);

    await personagem.reload();
    assert.equal(personagem.dinheiro, dinheiroAntes + 777, "nunca paga duas vezes");

    const grants = await EventPuzzleBossRewardGrant.count({ where: { id_event_edition: edicao.id, character_id: personagem.id } });
    assert.equal(grants, 1);
  },
);

testeComBanco("finalizarDerrota: marca Derrota e nunca concede recompensa", async () => {
  const { personagem } = await criarPersonagem({});
  const { edicao, versao } = await criarFundacaoComBoss();
  await completarGatilho(edicao.id, versao.id, personagem);
  const { attempt } = await sequelize.transaction((t) =>
    eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
  );

  await sequelize.transaction((t) => eventPuzzleBossAttemptService.finalizarDerrota(attempt, t));
  await attempt.reload();
  assert.equal(attempt.status, "Derrota");
  assert.ok(attempt.finished_at);

  const grant = await EventPuzzleBossRewardGrant.findOne({ where: { id_event_edition: edicao.id, character_id: personagem.id } });
  assert.equal(grant, null);
});

testeComBanco(
  "trocar nível depois de iniciar a attempt não altera player_snapshot/boss_snapshot congelados",
  async () => {
    const { personagem } = await criarPersonagem({ nivel: 25 });
    const { edicao, versao } = await criarFundacaoComBoss();
    await completarGatilho(edicao.id, versao.id, personagem);

    const { attempt } = await sequelize.transaction((t) =>
      eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
    );
    const playerSnapshotOriginal = JSON.stringify(attempt.player_snapshot);
    const bossSnapshotOriginal = JSON.stringify(attempt.boss_snapshot);

    personagem.nivel = 99;
    await personagem.save();

    const { attempt: retomada, retomada: foiRetomada } = await sequelize.transaction((t) =>
      eventPuzzleBossAttemptService.entrarOuRetomar(personagem.id, edicao.id, t),
    );
    assert.equal(foiRetomada, true, "mesma attempt Ativa — nunca remonta snapshot no meio da luta");
    assert.equal(JSON.stringify(retomada.player_snapshot), playerSnapshotOriginal);
    assert.equal(JSON.stringify(retomada.boss_snapshot), bossSnapshotOriginal);
  },
);

// Prova final: roda as migrations REAIS da Fase 13 (schema + conteúdo)
// contra o conteúdo REAL da Fase 12 já presente no banco de testes, e
// confirma que o Custódio real está gated na sala real
// "nucleo-da-convergencia" — nunca um fixture paralelo inventado pro
// teste.
testeComBanco(
  "ponta a ponta: migrations reais da Fase 13 produzem o Custódio gated na sala real do Núcleo",
  async () => {
    const { EventDefinition, PuzzleBlueprint, PuzzleBlueprintVersion } = require("../src/models/eventPuzzleModels");
    const definicao = await EventDefinition.findOne({ where: { key: "coracao-da-maquina-celestial" } });
    if (!definicao) return; // Fase 12 ainda não migrada neste banco — nada a verificar aqui.

    let config = await EventPuzzleBossConfig.findOne({ where: { id_event_definition: definicao.id } });
    if (!config) {
      // Migrations da Fase 13 ainda não aplicadas neste banco via
      // sequelize-cli (ex.: CI roda só os testes) — aplica aqui mesmo,
      // exatamente como `npx sequelize-cli db:migrate` faria.
      await migrationSchema.up(sequelize.getQueryInterface(), require("sequelize"));
      await migrationConteudoBoss.up(sequelize.getQueryInterface());
      config = await EventPuzzleBossConfig.findOne({ where: { id_event_definition: definicao.id } });
    }
    assert.ok(config, "migration de conteúdo da Fase 13 deveria ter criado o EventPuzzleBossConfig real");

    const gatilho = await PuzzleBlueprint.findByPk(config.id_blueprint_gatilho);
    assert.equal(gatilho.key, "nucleo-da-convergencia");
    const versaoGatilho = await PuzzleBlueprintVersion.findOne({
      where: { id_blueprint: gatilho.id, status: "PUBLISHED" },
    });
    assert.ok(versaoGatilho, "sala real do Núcleo deveria ter uma version PUBLISHED");

    const edicaoReal = await EventEdition.findOne({ where: { id_event_definition: definicao.id, status: "ACTIVE" } });
    assert.ok(edicaoReal, "edição real ACTIVE da Fase 12 deveria existir");

    const { personagem } = await criarPersonagem({ nivel: 40 });
    let status = await eventPuzzleBossAttemptService.obterStatusPublico(personagem.id, edicaoReal.id);
    assert.equal(status.desbloqueado, false, "sem ter terminado o Núcleo, o Custódio continua bloqueado");

    await completarGatilho(edicaoReal.id, versaoGatilho.id, personagem);

    status = await eventPuzzleBossAttemptService.obterStatusPublico(personagem.id, edicaoReal.id);
    assert.equal(status.desbloqueado, true, "depois de completar o Núcleo real, o Custódio real desbloqueia");
  },
);
