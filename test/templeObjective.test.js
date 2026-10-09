// Templo do Véu Celestial — Fase 3: progresso event-driven das
// Provações (§4.2/§4.3) e desbloqueio do Guardião (§4.4). Mesmo padrão
// de infra de templeLifecycle.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const TempleEvent = require("../src/models/TempleEvent");
const TempleMission = require("../src/models/TempleMission");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterTempleMissionProgress = require("../src/models/CharacterTempleMissionProgress");
const CharacterTempleProgress = require("../src/models/CharacterTempleProgress");
const templeObjectiveService = require("../src/services/templeObjectiveService");
const { EVENT_STATUS, MISSION_CATEGORY, OBJECTIVE_TYPE } = require("../src/config/templeConfig");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
  test.mock.method(require("../src/services/templeReleaseService"), "backgroundEnabled", async()=>true);
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

const itensCriados = [];
const eventosCriados = [];

async function criarItemSigilo() {
  const item = await Item.create({
    nome: `Sigilo Teste ${sufixo()}`,
    descricao: "Sigilo de teste",
    tipo_item: "Currencia",
    raridade: "Epico",
    disponivel_loja: false,
    negociavel_mercado: false,
  });
  itensCriados.push(item.id);
  return item;
}

// Monta um evento ACTIVE com config_snapshot congelado já incluindo as
// missões passadas — mesmo formato que templeLifecycleService.montarSnapshot
// produziria, pra não depender da Fase 2 rodar antes de cada teste.
async function criarEventoAtivo(missoes = []) {
  const item = await criarItemSigilo();
  const evento = await TempleEvent.create({
    key: `convergencia_${sufixo()}`,
    nome: "Vigília do Eclipse",
    status: EVENT_STATUS.ACTIVE,
    id_currency_item: item.id,
    config_snapshot: {
      schema_version: 1,
      nome: "Vigília do Eclipse",
      id_currency_item: item.id,
      missions: missoes,
      relicary: null,
      boss: null,
    },
  });
  eventosCriados.push(evento.id);
  return evento;
}

function missao(overrides) {
  return {
    id: 1,
    key: `missao_${sufixo()}`,
    categoria: MISSION_CATEGORY.RITO_DIARIO,
    objective_type: OBJECTIVE_TYPE.WIN_ADVENTURE_NO_CONSUMABLE,
    objective_config: {},
    meta: 1,
    reward_sigils: 10,
    nome_exibicao: "Missão de teste",
    descricao: "",
    ordem: 1,
    ...overrides,
  };
}

test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
    await CharacterTempleMissionProgress.destroy({ where: { id_event: eventosCriados } });
    await CharacterTempleProgress.destroy({ where: { id_event: eventosCriados } });
    await TempleMission.destroy({ where: { id_event: eventosCriados } });
    await TempleEvent.destroy({ where: { id: eventosCriados } });
    eventosCriados.length = 0;
  }
  if (itensCriados.length > 0) {
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("registrarProgresso: sem Convergência ACTIVE, não faz nada e não lança", async () => {
  const { personagem } = await criarPersonagem({});
  const concluidas = await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "WIN_ADVENTURE_NO_CONSUMABLE", { tipoEvento: "ADVENTURE_WIN" }, t),
  );
  assert.deepEqual(concluidas, []);
});

testeComBanco("WIN_ADVENTURE_NO_CONSUMABLE: incrementa em vitória sem consumível, ignora com consumível", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "sem_consumivel", objective_type: OBJECTIVE_TYPE.WIN_ADVENTURE_NO_CONSUMABLE, meta: 2 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "WIN_ADVENTURE_NO_CONSUMABLE",
      { tipoEvento: "ADVENTURE_WIN", usouConsumivel: true },
      t,
    ),
  );
  let progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "sem_consumivel" },
  });
  assert.equal(progresso?.progresso_atual ?? 0, 0, "vitória com consumível não deve progredir");

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "WIN_ADVENTURE_NO_CONSUMABLE",
      { tipoEvento: "ADVENTURE_WIN", usouConsumivel: false },
      t,
    ),
  );
  progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "sem_consumivel" },
  });
  assert.equal(progresso.progresso_atual, 1);
  assert.equal(progresso.completed_at, null);
});

testeComBanco("APPLY_STATUS: filtra por statusKey configurado na missão", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "aplicar_burn", objective_type: OBJECTIVE_TYPE.APPLY_STATUS, objective_config: { statusKey: "BURN" }, meta: 1 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "APPLY_STATUS", { tipoEvento: "STATUS_APPLIED", statusKey: "FREEZE" }, t),
  );
  let progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "aplicar_burn" },
  });
  assert.equal(progresso?.progresso_atual ?? 0, 0, "status diferente do configurado não deve progredir");

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "APPLY_STATUS", { tipoEvento: "STATUS_APPLIED", statusKey: "BURN" }, t),
  );
  progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "aplicar_burn" },
  });
  assert.equal(progresso.completed_at !== null, true);
});

testeComBanco("DEFEAT_AFFECTED_BY_STATUS: só conta se o inimigo tinha algum status da missão", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({
      key: "matar_queimando",
      objective_type: OBJECTIVE_TYPE.DEFEAT_AFFECTED_BY_STATUS,
      objective_config: { statusKeys: ["BURN", "POISON"] },
      meta: 1,
    }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "DEFEAT_AFFECTED_BY_STATUS",
      { tipoEvento: "ADVENTURE_WIN", statusDoInimigo: ["FREEZE"] },
      t,
    ),
  );
  let progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "matar_queimando" },
  });
  assert.equal(progresso?.progresso_atual ?? 0, 0);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "DEFEAT_AFFECTED_BY_STATUS",
      { tipoEvento: "ADVENTURE_WIN", statusDoInimigo: ["POISON"] },
      t,
    ),
  );
  progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "matar_queimando" },
  });
  assert.equal(progresso.completed_at !== null, true);
});

testeComBanco("WIN_DISTINCT_ZONES: só conta zonas distintas, progresso é absoluto (tamanho do set)", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "zonas_distintas", objective_type: OBJECTIVE_TYPE.WIN_DISTINCT_ZONES, meta: 3 }),
  ]);

  for (const zoneId of [10, 10, 20, 20, 30]) {
    await sequelize.transaction((t) =>
      templeObjectiveService.registrarProgresso(personagem.id, "WIN_DISTINCT_ZONES", { tipoEvento: "ADVENTURE_WIN", zoneId }, t),
    );
  }

  const progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "zonas_distintas" },
  });
  assert.equal(progresso.progresso_atual, 3, "3 zonas distintas (10,20,30), repetições não contam de novo");
  assert.equal(progresso.completed_at !== null, true);
});

testeComBanco("FINAL_BLOW_WITH_POWER: só conta quando o golpe final usou poder", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "golpe_poder", objective_type: OBJECTIVE_TYPE.FINAL_BLOW_WITH_POWER, meta: 1 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "FINAL_BLOW_WITH_POWER",
      { tipoEvento: "ADVENTURE_WIN", golpeFinalComPoder: false },
      t,
    ),
  );
  let progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "golpe_poder" },
  });
  assert.equal(progresso?.progresso_atual ?? 0, 0);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "FINAL_BLOW_WITH_POWER",
      { tipoEvento: "ADVENTURE_WIN", golpeFinalComPoder: true },
      t,
    ),
  );
  progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "golpe_poder" },
  });
  assert.equal(progresso.completed_at !== null, true);
});

testeComBanco("CRAFT_RARITY_OR_HIGHER: respeita o rank mínimo de raridade configurado", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({
      key: "craft_epico",
      objective_type: OBJECTIVE_TYPE.CRAFT_RARITY_OR_HIGHER,
      objective_config: { minRaridade: "Epico" },
      meta: 1,
    }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CRAFT_RARITY_OR_HIGHER", { tipoEvento: "CRAFT_SUCCESS", raridade: "Raro" }, t),
  );
  let progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "craft_epico" },
  });
  assert.equal(progresso?.progresso_atual ?? 0, 0, "Raro é abaixo do mínimo Epico");

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(
      personagem.id,
      "CRAFT_RARITY_OR_HIGHER",
      { tipoEvento: "CRAFT_SUCCESS", raridade: "Lendario" },
      t,
    ),
  );
  progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "craft_epico" },
  });
  assert.equal(progresso.completed_at !== null, true, "Lendario é acima do mínimo Epico");
});

testeComBanco("COMPLETE_EXPEDITIONS e PARTY_ADVENTURE_WINS: incrementam por evento correspondente", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "expedicoes", objective_type: OBJECTIVE_TYPE.COMPLETE_EXPEDITIONS, meta: 2 }),
    missao({ key: "party_wins", objective_type: OBJECTIVE_TYPE.PARTY_ADVENTURE_WINS, meta: 2 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "COMPLETE_EXPEDITIONS", { tipoEvento: "EXPEDITION_COMPLETE" }, t),
  );
  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "PARTY_ADVENTURE_WINS", { tipoEvento: "PARTY_ADVENTURE_WIN" }, t),
  );

  const progressoExpedicoes = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "expedicoes" },
  });
  const progressoParty = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "party_wins" },
  });
  assert.equal(progressoExpedicoes.progresso_atual, 1);
  assert.equal(progressoParty.progresso_atual, 1);
});

testeComBanco("CLEANSE_STATUS: incrementa só no evento CLEANSE_APPLIED", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "purificar", objective_type: OBJECTIVE_TYPE.CLEANSE_STATUS, meta: 1 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CLEANSE_STATUS", { tipoEvento: "CLEANSE_APPLIED" }, t),
  );
  const progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "purificar" },
  });
  assert.equal(progresso.completed_at !== null, true);
});

testeComBanco("registrarProgresso é idempotente: missão já completed nunca reabre nem passa da meta", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "unica", objective_type: OBJECTIVE_TYPE.CLEANSE_STATUS, meta: 1 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CLEANSE_STATUS", { tipoEvento: "CLEANSE_APPLIED" }, t),
  );
  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CLEANSE_STATUS", { tipoEvento: "CLEANSE_APPLIED" }, t),
  );

  const progresso = await CharacterTempleMissionProgress.findOne({
    where: { id_event: evento.id, character_id: personagem.id, mission_key: "unica" },
  });
  assert.equal(progresso.progresso_atual, 1, "nunca passa da meta mesmo chamado de novo após completar");
});

testeComBanco("verificarDesbloqueioDoBoss: só desbloqueia quando TODAS as Provações Principais estiverem completed", async () => {
  const { personagem } = await criarPersonagem({});
  await criarEventoAtivo([
    missao({ key: "principal_1", categoria: MISSION_CATEGORY.PROVACAO_PRINCIPAL, objective_type: OBJECTIVE_TYPE.CLEANSE_STATUS, meta: 1 }),
    missao({ key: "principal_2", categoria: MISSION_CATEGORY.PROVACAO_PRINCIPAL, objective_type: OBJECTIVE_TYPE.COMPLETE_EXPEDITIONS, meta: 1 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CLEANSE_STATUS", { tipoEvento: "CLEANSE_APPLIED" }, t),
  );
  let charProgress = await CharacterTempleProgress.findOne({ where: { character_id: personagem.id } });
  assert.equal(charProgress, null, "só uma das duas Provações Principais concluída não desbloqueia o Boss");

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "COMPLETE_EXPEDITIONS", { tipoEvento: "EXPEDITION_COMPLETE" }, t),
  );
  charProgress = await CharacterTempleProgress.findOne({ where: { character_id: personagem.id } });
  assert.ok(charProgress?.boss_unlocked_at, "as duas Provações Principais concluídas devem desbloquear o Boss");
});

testeComBanco("entregarItem: debita o inventário e completa a missão DELIVER_ITEM na mesma transaction", async () => {
  const { personagem } = await criarPersonagem({});
  const itemEntrega = await criarItemSigilo();
  await criarEventoAtivo([
    missao({
      key: "entregar_relíquia",
      objective_type: OBJECTIVE_TYPE.DELIVER_ITEM,
      objective_config: { itemId: itemEntrega.id, quantidade: 3 },
      meta: 1,
      reward_sigils: 25,
    }),
  ]);
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemEntrega.id, quantidade: 5 });

  await sequelize.transaction((t) => templeObjectiveService.entregarItem(personagem.id, "entregar_relíquia", t));

  const estoque = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemEntrega.id } });
  assert.equal(estoque.quantidade, 2, "deve debitar exatamente a quantidade pedida");

  await assert.rejects(
    () => sequelize.transaction((t) => templeObjectiveService.entregarItem(personagem.id, "entregar_relíquia", t)),
    /já entregou/,
  );
});

testeComBanco("entregarItem: sem estoque suficiente, lança e não completa a missão", async () => {
  const { personagem } = await criarPersonagem({});
  const itemEntrega = await criarItemSigilo();
  await criarEventoAtivo([
    missao({
      key: "entregar_pouco",
      objective_type: OBJECTIVE_TYPE.DELIVER_ITEM,
      objective_config: { itemId: itemEntrega.id, quantidade: 10 },
      meta: 1,
    }),
  ]);
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemEntrega.id, quantidade: 1 });

  await assert.rejects(() => sequelize.transaction((t) => templeObjectiveService.entregarItem(personagem.id, "entregar_pouco", t)));
});

testeComBanco("reclamarRecompensa: credita Sigilos uma vez só, rejeita resgate duplicado ou prematuro", async () => {
  const { personagem } = await criarPersonagem({});
  const evento = await criarEventoAtivo([
    missao({ key: "resgate", objective_type: OBJECTIVE_TYPE.CLEANSE_STATUS, meta: 1, reward_sigils: 15 }),
  ]);

  await assert.rejects(
    () => sequelize.transaction((t) => templeObjectiveService.reclamarRecompensa(personagem.id, "resgate", t)),
    /ainda não foi concluída/,
  );

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CLEANSE_STATUS", { tipoEvento: "CLEANSE_APPLIED" }, t),
  );

  const resultado = await sequelize.transaction((t) => templeObjectiveService.reclamarRecompensa(personagem.id, "resgate", t));
  assert.equal(resultado.sigilosGanhos, 15);

  const estoqueSigilos = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: evento.id_currency_item },
  });
  assert.equal(estoqueSigilos.quantidade, 15);

  await assert.rejects(
    () => sequelize.transaction((t) => templeObjectiveService.reclamarRecompensa(personagem.id, "resgate", t)),
    /já resgatou/,
  );
});

testeComBanco("listarMissoes: mistura snapshot + progresso, inclusive missões ainda não iniciadas (progresso 0)", async () => {
  const { personagem } = await criarPersonagem({});
  await criarEventoAtivo([
    missao({ key: "iniciada", objective_type: OBJECTIVE_TYPE.CLEANSE_STATUS, meta: 2, reward_sigils: 5 }),
    missao({ key: "nao_iniciada", objective_type: OBJECTIVE_TYPE.COMPLETE_EXPEDITIONS, meta: 3, reward_sigils: 8 }),
  ]);

  await sequelize.transaction((t) =>
    templeObjectiveService.registrarProgresso(personagem.id, "CLEANSE_STATUS", { tipoEvento: "CLEANSE_APPLIED" }, t),
  );

  const resultado = await templeObjectiveService.listarMissoes(personagem.id);
  const iniciada = resultado.missions.find((m) => m.key === "iniciada");
  const naoIniciada = resultado.missions.find((m) => m.key === "nao_iniciada");

  assert.equal(iniciada.progresso_atual, 1);
  assert.equal(iniciada.completed_at, null);
  assert.equal(naoIniciada.progresso_atual, 0, "missão sem linha de progresso ainda deve aparecer com 0");
  assert.equal(naoIniciada.completed_at, null);
});
