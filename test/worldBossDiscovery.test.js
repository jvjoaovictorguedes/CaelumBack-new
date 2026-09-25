// Boss Global — Fases 2 e 3: Descoberta (§4/§5), status público
// (§5.2/§11) e o scheduler que avança o ciclo sozinho. Threshold nunca
// vaza pro jogador; só a vitória PvE de ZONA (id_area presente) conta;
// zona fora da lista do config nunca dispara; concorrência: LOCK.UPDATE
// na linha do evento garante um único "descobridor" mesmo com duas
// vitórias simultâneas perto do threshold.
//
// Deliberadamente em UM ÚNICO arquivo (não splitado por fase): o
// índice único parcial world_boss_events_um_aberto_idx (no máximo um
// evento Dormant/Discovered/Active) e a garantia de no máximo uma
// linha COOLDOWN (agendarProximoCiclo) são invariantes de BANCO,
// compartilhadas por todo teste que crie um evento nesses status. Como
// os testes deste projeto rodam em paralelo entre ARQUIVOS (mas em
// série DENTRO de um arquivo), splitar esses testes em dois arquivos
// os deixa em corrida um contra o outro pela mesma linha única —
// sintoma visto na prática: um arquivo cria o evento aberto no meio do
// outro tentando montar o cenário dele, e a asserção erra por causa de
// estado alheio, não por bug de verdade. Um arquivo só resolve isso de
// vez.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const AdventureZone = require("../src/models/AdventureZone");
const WorldBossConfig = require("../src/models/WorldBossConfig");
const WorldBossConfigZone = require("../src/models/WorldBossConfigZone");
const WorldBossPhase = require("../src/models/WorldBossPhase");
const WorldBossEvent = require("../src/models/WorldBossEvent");
const WorldBossActivityMetric = require("../src/models/WorldBossActivityMetric");
const worldBossDiscoveryService = require("../src/services/worldBossDiscoveryService");
const worldBossLifecycleService = require("../src/services/worldBossLifecycleService");
const worldBossStatusService = require("../src/services/worldBossStatusService");
const worldBossScheduler = require("../src/services/worldBossScheduler");
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

// Tudo que participa do índice único parcial (eventos) OU da roleta de
// seleção de config (worldBossLifecycleService.selecionarConfig lê
// TODO WorldBossConfig ativo=true) precisa sumir a cada teste, não só
// no fim do arquivo — senão um config esquecido de um teste anterior
// pode ser sorteado no lugar do config que o teste seguinte acabou de
// criar.
test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
    await WorldBossEvent.destroy({ where: { id: eventosCriados } });
    eventosCriados.length = 0;
  }
  if (configsCriados.length > 0) {
    await WorldBossConfigZone.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossPhase.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossConfig.destroy({ where: { id: configsCriados } });
    configsCriados.length = 0;
  }
  if (itensCriados.length > 0) {
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (!temBanco) return;
  await AdventureZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
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

async function criarConfigComFases() {
  const config = await criarConfig();
  await WorldBossPhase.create({ id_world_boss_config: config.id, ordem: 1, nome_fase: "Fase 1", hp_percentual_max: 100 });
  await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 2,
    nome_fase: "Fase 2 - Fúria",
    hp_percentual_max: 30,
    modificador_dano_percentual: 25,
    texto_alerta: "Ela enfurece!",
  });
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

async function criarEvento({ config, status, overrides = {} }) {
  const evento = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status,
    hp_max: 1000,
    hp_current: 1000,
    config_snapshot: {
      nome: config.nome,
      descricao: config.descricao,
      mensagem_convocacao: config.mensagem_convocacao,
      fases: [
        { ordem: 1, nome_fase: "Fase 1", hp_percentual_max: 100, modificador_dano_percentual: 0, texto_alerta: null },
        {
          ordem: 2,
          nome_fase: "Fase 2 - Fúria",
          hp_percentual_max: 30,
          modificador_dano_percentual: 25,
          texto_alerta: "Ela enfurece!",
        },
      ],
    },
    ...overrides,
  });
  eventosCriados.push(evento.id);
  return evento;
}

// ---------------------------------------------------------------------
// Fase 2 — Descoberta
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Fase 2/3 — lifecycle (COOLDOWN -> DORMANT) e scheduler
// ---------------------------------------------------------------------

testeComBanco("lifecycle: agendarProximoCiclo cria evento COOLDOWN e não duplica se já existe um aberto/em espera", async () => {
  const zona = await criarZona();
  await criarConfig({ zonas: [zona] });

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

testeComBanco("lifecycle.agendarProximoCiclo nunca cria uma segunda linha se já existe um evento aberto", async () => {
  const config = await criarConfigComFases();
  await criarEvento({ config, status: EVENT_STATUS.ACTIVE, overrides: { activated_at: new Date() } });

  const resultado = await sequelize.transaction((t) => worldBossLifecycleService.agendarProximoCiclo(t));
  assert.equal(resultado, null);
});

testeComBanco("scheduler.tick: bootstrap cria COOLDOWN quando não existe nada, e não duplica em ticks seguidos", async () => {
  const config = await criarConfigComFases();

  await worldBossScheduler.tick();
  const evento = await WorldBossEvent.findOne({ where: { id_world_boss_config: config.id } });
  assert.ok(evento);
  eventosCriados.push(evento.id);
  assert.equal(evento.status, EVENT_STATUS.COOLDOWN);

  await worldBossScheduler.tick();
  const total = await WorldBossEvent.count({ where: { id_world_boss_config: config.id } });
  assert.equal(total, 1);
});

testeComBanco("scheduler.tick: COOLDOWN vencido vira DORMANT, e DISCOVERED vencido vira ACTIVE", async () => {
  const config = await criarConfigComFases();
  const evento = await criarEvento({
    config,
    status: EVENT_STATUS.COOLDOWN,
    overrides: { next_eligible_at: new Date(Date.now() - 1000) },
  });

  await worldBossScheduler.tick();
  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.DORMANT);
  assert.ok(Number(evento.discovery_threshold) >= 1);

  evento.status = EVENT_STATUS.DISCOVERED;
  evento.auto_awaken_at = new Date(Date.now() - 1000);
  evento.discovered_at = new Date();
  await evento.save();

  await worldBossScheduler.tick();
  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.ACTIVE);
  assert.ok(evento.activated_at);
});

// ---------------------------------------------------------------------
// Fase 3 — status público
// ---------------------------------------------------------------------

testeComBanco("sem nenhum evento visível, status público é 'Nenhum'", async () => {
  const status = await worldBossStatusService.obterStatusPublico();
  assert.equal(status.status, "Nenhum");
});

testeComBanco("evento em DORMANT/COOLDOWN nunca aparece no status público (segredo até ser descoberto)", async () => {
  const config = await criarConfigComFases();
  await criarEvento({ config, status: EVENT_STATUS.DORMANT, overrides: { discovery_threshold: 50, discovery_progress: 10 } });

  const status = await worldBossStatusService.obterStatusPublico();
  assert.equal(status.status, "Nenhum");
});

testeComBanco("evento DISCOVERED aparece completo, sem threshold/progress, com a fase correta", async () => {
  const config = await criarConfigComFases();
  await criarEvento({
    config,
    status: EVENT_STATUS.DISCOVERED,
    overrides: { hp_current: 1000, discovered_at: new Date(), auto_awaken_at: new Date(Date.now() + 60000) },
  });

  const status = await worldBossStatusService.obterStatusPublico();
  assert.equal(status.status, "DISCOVERED");
  assert.equal(status.nome, config.nome);
  assert.equal(status.hp_percentual, 100);
  assert.equal(status.fase_atual.nome_fase, "Fase 1");
  assert.ok(status.auto_awaken_at);
  assert.equal(Object.prototype.hasOwnProperty.call(status, "discovery_threshold"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(status, "discovery_progress"), false);
});

testeComBanco("HP baixo muda a fase reportada pra 'Fúria'", async () => {
  const config = await criarConfigComFases();
  await criarEvento({
    config,
    status: EVENT_STATUS.ACTIVE,
    overrides: { hp_current: 200, activated_at: new Date() },
  });

  const status = await worldBossStatusService.obterStatusPublico();
  assert.equal(status.hp_percentual, 20);
  assert.equal(status.fase_atual.nome_fase, "Fase 2 - Fúria");
  assert.equal(status.auto_awaken_at, null);
});
