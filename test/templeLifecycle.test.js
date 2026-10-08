// Templo do Véu Celestial — Fase 2: ciclo de vida (§3/§12.3) e status
// público (§13.1/§13.2). Mesmo padrão de infra de
// worldBossDiscovery.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const TempleEvent = require("../src/models/TempleEvent");
const TempleMission = require("../src/models/TempleMission");
const CharacterInventory = require("../src/models/CharacterInventory");
const templeLifecycleService = require("../src/services/templeLifecycleService");
const templeScheduler = require("../src/services/templeScheduler");
const templeStatusService = require("../src/services/templeStatusService");
const { EVENT_STATUS } = require("../src/config/templeConfig");

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

async function criarEvento({ idItem, status = EVENT_STATUS.SCHEDULED, ...overrides } = {}) {
  const item = idItem ? { id: idItem } : await criarItemSigilo();
  const evento = await TempleEvent.create({
    key: `convergencia_${sufixo()}`,
    nome: "Vigília do Eclipse",
    status,
    id_currency_item: item.id,
    ...overrides,
  });
  eventosCriados.push(evento.id);
  return evento;
}

test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
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

testeComBanco("promoverEstados: SCHEDULED com starts_at no passado vira ACTIVE e congela o snapshot", async () => {
  const evento = await criarEvento({
    starts_at: new Date(Date.now() - 1000),
    missions_end_at: new Date(Date.now() + 86_400_000),
  });
  await TempleMission.create({
    id_event: evento.id,
    key: "rito_teste",
    categoria: "RITO_DIARIO",
    objective_type: "APPLY_STATUS",
    objective_config: { statusKey: "BURN" },
    meta: 5,
    reward_sigils: 10,
    nome_exibicao: "Aplicar Queimadura",
  });

  await sequelize.transaction((t) => templeLifecycleService.promoverEstados(t));

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.ACTIVE);
  assert.ok(evento.config_snapshot, "config_snapshot deve existir após ativar");
  assert.equal(evento.config_snapshot.missions.length, 1);
  assert.equal(evento.config_snapshot.missions[0].key, "rito_teste");
  assert.equal(evento.config_snapshot.schema_version, templeLifecycleService.SNAPSHOT_SCHEMA_VERSION);
});

testeComBanco("promoverEstados: SCHEDULED com starts_at no futuro NÃO ativa", async () => {
  const evento = await criarEvento({ starts_at: new Date(Date.now() + 86_400_000) });

  await sequelize.transaction((t) => templeLifecycleService.promoverEstados(t));

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.SCHEDULED);
});

testeComBanco("promoverEstados: ACTIVE com missions_end_at no passado vira RELICARY_ONLY", async () => {
  const evento = await criarEvento({
    status: EVENT_STATUS.ACTIVE,
    config_snapshot: { schema_version: 1, missions: [] },
    missions_end_at: new Date(Date.now() - 1000),
    relicary_end_at: new Date(Date.now() + 86_400_000),
  });

  await sequelize.transaction((t) => templeLifecycleService.promoverEstados(t));

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.RELICARY_ONLY);
});

testeComBanco("promoverEstados: RELICARY_ONLY com relicary_end_at no passado vira ENDED", async () => {
  const evento = await criarEvento({
    status: EVENT_STATUS.RELICARY_ONLY,
    config_snapshot: { schema_version: 1, missions: [] },
    relicary_end_at: new Date(Date.now() - 1000),
  });

  await sequelize.transaction((t) => templeLifecycleService.promoverEstados(t));

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.ENDED);
  assert.ok(evento.ended_at, "ended_at deve ser preenchido");
});

testeComBanco(
  "promoverEstados: nunca deixa dois eventos ACTIVE/RELICARY_ONLY ao mesmo tempo (§12.3)",
  async () => {
    const jaAtivo = await criarEvento({
      status: EVENT_STATUS.ACTIVE,
      config_snapshot: { schema_version: 1, missions: [] },
      missions_end_at: new Date(Date.now() + 86_400_000),
    });
    const prontoPraAtivar = await criarEvento({
      idItem: jaAtivo.id_currency_item,
      starts_at: new Date(Date.now() - 1000),
    });

    await sequelize.transaction((t) => templeLifecycleService.promoverEstados(t));

    await prontoPraAtivar.reload();
    assert.equal(
      prontoPraAtivar.status,
      EVENT_STATUS.SCHEDULED,
      "segunda Convergência deve esperar a primeira sair de ACTIVE/RELICARY_ONLY",
    );
  },
);

testeComBanco(
  "índice único parcial do banco rejeita um segundo evento ACTIVE/RELICARY_ONLY (defesa em profundidade)",
  async () => {
    const primeiro = await criarEvento({
      status: EVENT_STATUS.ACTIVE,
      config_snapshot: { schema_version: 1, missions: [] },
    });
    const segundo = await criarEvento({ idItem: primeiro.id_currency_item, status: EVENT_STATUS.SCHEDULED });

    segundo.status = EVENT_STATUS.ACTIVE;
    segundo.config_snapshot = { schema_version: 1, missions: [] };
    await assert.rejects(() => segundo.save());
  },
);

testeComBanco("templeScheduler.tick roda sem erro e é idempotente", async () => {
  const evento = await criarEvento({ starts_at: new Date(Date.now() - 1000) });

  await templeScheduler.tick();
  await templeScheduler.tick();

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.ACTIVE);
});

testeComBanco("templeStatusService.obterStatusPublico devolve meus_sigilos do personagem", async () => {
  const evento = await criarEvento({
    status: EVENT_STATUS.ACTIVE,
    config_snapshot: { schema_version: 1, nome: "Vigília do Eclipse (congelado)", missions: [] },
  });
  const { personagem } = await criarPersonagem({});
  await CharacterInventory.create({
    id_personagem: personagem.id,
    id_item: evento.id_currency_item,
    quantidade: 42,
  });

  const status = await templeStatusService.obterStatusPublico(personagem.id);

  assert.equal(status.status, EVENT_STATUS.ACTIVE);
  assert.equal(status.nome, "Vigília do Eclipse (congelado)");
  assert.equal(status.meus_sigilos, 42);
});

testeComBanco("templeStatusService.obterStatusPublico devolve 'Nenhum' quando só existe DRAFT", async () => {
  await criarEvento({ status: EVENT_STATUS.DRAFT });
  const status = await templeStatusService.obterStatusPublico();
  assert.equal(status.status, "Nenhum");
});
