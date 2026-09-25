// Boss Global — Fase 2: Descoberta (§4/§5). Threshold nunca vaza pro
// jogador; só a vitória PvE de ZONA (id_area presente) conta; zona
// fora da lista do config nunca dispara; concorrência: LOCK.UPDATE na
// linha do evento garante um único "descobridor" mesmo com duas
// vitórias simultâneas perto do threshold.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const AdventureZone = require("../src/models/AdventureZone");
const WorldBossConfig = require("../src/models/WorldBossConfig");
const WorldBossConfigZone = require("../src/models/WorldBossConfigZone");
const WorldBossEvent = require("../src/models/WorldBossEvent");
const WorldBossActivityMetric = require("../src/models/WorldBossActivityMetric");
const worldBossDiscoveryService = require("../src/services/worldBossDiscoveryService");
const worldBossLifecycleService = require("../src/services/worldBossLifecycleService");
const { EVENT_STATUS } = require("../src/config/worldBossConfig");

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
const zonasCriadas = [];
const configsCriados = [];
const eventosCriados = [];

// O índice único parcial world_boss_events_um_aberto_idx permite no
// máximo UM evento aberto (Dormant/Discovered/Active) — e COOLDOWN
// também é único por design de agendarProximoCiclo. Como os testes
// deste arquivo compartilham o mesmo banco, cada evento criado
// precisa ser removido ANTES do próximo teste rodar, ou o segundo
// teste esbarra na constraint que o primeiro deixou pra trás.
test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length === 0) return;
  await WorldBossEvent.destroy({ where: { id: eventosCriados } });
  eventosCriados.length = 0;
});

test.after(async () => {
  if (!temBanco) return;
  await WorldBossConfigZone.destroy({ where: { id_world_boss_config: configsCriados.length ? configsCriados : [-1] } });
  await WorldBossConfig.destroy({ where: { id: configsCriados.length ? configsCriados : [-1] } });
  await AdventureZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  await Item.destroy({ where: { id: itensCriados.length ? itensCriados : [-1] } });
  await sequelize.close();
});

async function criarItemGolpeFinal() {
  const item = await Item.create({
    nome: `Item Golpe Final ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Espolio",
    raridade: "Lendario",
    valor_compra: 0,
    valor_venda: 1,
  });
  itensCriados.push(item.id);
  return item;
}

// Nome PRECISA conter "Teste" — convenção do projeto (ver comentário
// em aventuraExpansao.test.js) pra que os testes de conteúdo da
// Aventura filtrem fixtures de outros arquivos quando os testes rodam
// em paralelo, sem contar essa zona descartável nas asserções de
// catálogo fixo (ex.: "exatamente 10 áreas ativas").
async function criarZona() {
  const zona = await AdventureZone.create({
    nome: `Zona Teste Boss Global ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
  });
  zonasCriadas.push(zona.id);
  return zona;
}

async function criarConfig({ zonas = [] } = {}) {
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça de teste ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 100000,
    defesa: 0,
    mensagem_descoberta: "O chão treme...",
    mensagem_convocacao: "Ela desperta!",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  for (const zona of zonas) {
    await WorldBossConfigZone.create({ id_world_boss_config: config.id, id_zone: zona.id });
  }
  return config;
}

async function criarEventoDormant({ config, threshold = 3, progress = 0 }) {
  const evento = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status: EVENT_STATUS.DORMANT,
    hp_max: config.vida_base,
    hp_current: config.vida_base,
    config_snapshot: { nome: config.nome, mensagem_descoberta: config.mensagem_descoberta },
    discovery_threshold: threshold,
    discovery_progress: progress,
  });
  eventosCriados.push(evento.id);
  return evento;
}

testeComBanco("encontro legado (sem id_area) nunca conta pra descoberta", async () => {
  const { personagem } = await criarPersonagem();
  const zona = await criarZona();
  const config = await criarConfig({ zonas: [zona] });
  const evento = await criarEventoDormant({ config, threshold: 1 });

  await sequelize.transaction(async (t) => {
    const resultado = await worldBossDiscoveryService.registrarEncontroElegivel(personagem, { id_area: null }, t);
    assert.equal(resultado, null);
  });

  await evento.reload();
  assert.equal(Number(evento.discovery_progress), 0);
  assert.equal(evento.status, EVENT_STATUS.DORMANT);
});

testeComBanco("vitória em zona fora da lista do config não incrementa progresso", async () => {
  const { personagem } = await criarPersonagem();
  const zonaDoConfig = await criarZona();
  const zonaDeFora = await criarZona();
  const config = await criarConfig({ zonas: [zonaDoConfig] });
  const evento = await criarEventoDormant({ config, threshold: 1 });

  await sequelize.transaction(async (t) => {
    const resultado = await worldBossDiscoveryService.registrarEncontroElegivel(
      personagem,
      { id_area: zonaDeFora.id },
      t,
    );
    assert.equal(resultado, null);
  });

  await evento.reload();
  assert.equal(Number(evento.discovery_progress), 0);
});

testeComBanco("progresso incrementa e só descobre ao atingir o threshold, nunca antes", async () => {
  const { personagem } = await criarPersonagem();
  const zona = await criarZona();
  const config = await criarConfig({ zonas: [zona] });
  const evento = await criarEventoDormant({ config, threshold: 3 });

  await sequelize.transaction(async (t) => {
    const r1 = await worldBossDiscoveryService.registrarEncontroElegivel(personagem, { id_area: zona.id }, t);
    assert.equal(r1, null);
  });
  await evento.reload();
  assert.equal(Number(evento.discovery_progress), 1);
  assert.equal(evento.status, EVENT_STATUS.DORMANT);

  await sequelize.transaction(async (t) => {
    const r2 = await worldBossDiscoveryService.registrarEncontroElegivel(personagem, { id_area: zona.id }, t);
    assert.equal(r2, null);
  });
  await evento.reload();
  assert.equal(Number(evento.discovery_progress), 2);
  assert.equal(evento.status, EVENT_STATUS.DORMANT);

  let descoberta;
  await sequelize.transaction(async (t) => {
    descoberta = await worldBossDiscoveryService.registrarEncontroElegivel(personagem, { id_area: zona.id }, t);
  });
  assert.equal(descoberta.descoberto, true);
  assert.equal(descoberta.event_id, evento.id);

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.DISCOVERED);
  assert.equal(evento.discoverer_character_id, personagem.id);
  assert.equal(evento.discovery_zone_id, zona.id);
  assert.ok(evento.discovered_at);
  assert.ok(evento.auto_awaken_at);
});

testeComBanco("descoberta é set-once: uma segunda vitória com evento já DISCOVERED não sobrescreve o descobridor", async () => {
  const { personagem: descobridor } = await criarPersonagem();
  const { personagem: segundoJogador } = await criarPersonagem();
  const zona = await criarZona();
  const config = await criarConfig({ zonas: [zona] });
  const evento = await criarEventoDormant({ config, threshold: 1 });

  await sequelize.transaction(async (t) => {
    await worldBossDiscoveryService.registrarEncontroElegivel(descobridor, { id_area: zona.id }, t);
  });
  await evento.reload();
  assert.equal(evento.discoverer_character_id, descobridor.id);

  await sequelize.transaction(async (t) => {
    const resultado = await worldBossDiscoveryService.registrarEncontroElegivel(segundoJogador, { id_area: zona.id }, t);
    assert.equal(resultado, null);
  });
  await evento.reload();
  assert.equal(evento.discoverer_character_id, descobridor.id);
});

testeComBanco("sem evento DORMANT aberto, encontro elegível não faz nada (mas ainda registra métrica)", async () => {
  const { personagem } = await criarPersonagem();
  const zona = await criarZona();

  await sequelize.transaction(async (t) => {
    const resultado = await worldBossDiscoveryService.registrarEncontroElegivel(personagem, { id_area: zona.id }, t);
    assert.equal(resultado, null);
  });

  const metrica = await WorldBossActivityMetric.findOne({ order: [["id", "DESC"]] });
  assert.ok(metrica);
  assert.ok(Number(metrica.encontros_elegiveis) >= 1);
});

testeComBanco("lifecycle: agendarProximoCiclo cria evento COOLDOWN e não duplica se já existe um aberto/em espera", async () => {
  const zona = await criarZona();
  const config = await criarConfig({ zonas: [zona] });

  let criado;
  await sequelize.transaction(async (t) => {
    criado = await worldBossLifecycleService.agendarProximoCiclo(t, { apartirDe: new Date() });
  });
  assert.ok(criado);
  eventosCriados.push(criado.id);
  assert.equal(criado.status, EVENT_STATUS.COOLDOWN);
  assert.ok(criado.next_eligible_at);

  await sequelize.transaction(async (t) => {
    const segunda = await worldBossLifecycleService.agendarProximoCiclo(t, { apartirDe: new Date() });
    assert.equal(segunda.id, criado.id);
  });
});

testeComBanco("lifecycle: ativarSeElegivel só transiciona COOLDOWN -> DORMANT após next_eligible_at, sorteando threshold dentro do range", async () => {
  const zona = await criarZona();
  const config = await criarConfig({ zonas: [zona] });

  const futuro = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status: EVENT_STATUS.COOLDOWN,
    hp_max: config.vida_base,
    hp_current: config.vida_base,
    config_snapshot: { nome: config.nome },
    next_eligible_at: new Date(Date.now() + 60 * 60 * 1000),
  });
  eventosCriados.push(futuro.id);

  await sequelize.transaction(async (t) => {
    const resultado = await worldBossLifecycleService.ativarSeElegivel(t);
    assert.equal(resultado, null);
  });
  await futuro.reload();
  assert.equal(futuro.status, EVENT_STATUS.COOLDOWN);

  futuro.next_eligible_at = new Date(Date.now() - 1000);
  await futuro.save();

  await sequelize.transaction(async (t) => {
    const resultado = await worldBossLifecycleService.ativarSeElegivel(t);
    assert.equal(resultado.id, futuro.id);
    assert.equal(resultado.status, EVENT_STATUS.DORMANT);
    const threshold = Number(resultado.discovery_threshold);
    assert.ok(threshold >= 1);
    assert.equal(Number(resultado.discovery_progress), 0);
  });
});
