// Boss Global — Fases 2, 3 e 4: Descoberta (§4/§5), status público
// (§5.2/§11), o scheduler que avança o ciclo sozinho, e Combate
// (§9/§13/§31 — sessão individual vs HP global). Threshold nunca vaza
// pro jogador; só a vitória PvE de ZONA (id_area presente) conta pra
// descoberta; zona fora da lista do config nunca dispara;
// concorrência: LOCK.UPDATE na linha do evento garante um único
// "descobridor" mesmo com duas vitórias simultâneas perto do
// threshold, e o mesmo lock serializa toda ação de combate de todo
// mundo (é o que torna o Golpe Final atômico).
//
// Deliberadamente em UM ÚNICO arquivo (não splitado por fase): o
// índice único parcial world_boss_events_um_aberto_idx (no máximo um
// evento Dormant/Discovered/Active) e a garantia de no máximo uma
// linha COOLDOWN (agendarProximoCiclo) são invariantes de BANCO,
// compartilhadas por TODO teste que crie um evento nesses status —
// combate incluso, já que uma sessão de combate só existe contra um
// evento ACTIVE. Como os testes deste projeto rodam em paralelo entre
// ARQUIVOS (mas em série DENTRO de um arquivo), splitar esses testes
// em arquivos diferentes os deixa em corrida um contra o outro pela
// mesma linha única — sintoma visto na prática: um arquivo cria o
// evento aberto no meio do outro tentando montar o cenário dele, e a
// asserção erra por causa de estado alheio, não por bug de verdade. Um
// arquivo só resolve isso de vez.
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
const WorldBossCombatSession = require("../src/models/WorldBossCombatSession");
const WorldBossContribution = require("../src/models/WorldBossContribution");
const WorldBossRewardGrant = require("../src/models/WorldBossRewardGrant");
const WorldBossAbility = require("../src/models/WorldBossAbility");
const WorldBossStatusResistance = require("../src/models/WorldBossStatusResistance");
const WorldBossRankingReward = require("../src/models/WorldBossRankingReward");
const Power = require("../src/models/Power");
const CharacterInventory = require("../src/models/CharacterInventory");
const worldBossDiscoveryService = require("../src/services/worldBossDiscoveryService");
const worldBossLifecycleService = require("../src/services/worldBossLifecycleService");
const worldBossStatusService = require("../src/services/worldBossStatusService");
const worldBossScheduler = require("../src/services/worldBossScheduler");
const worldBossCombatService = require("../src/services/worldBossCombatService");
const worldBossRuntimeService = require("../src/services/worldBossRuntimeService");
const worldBossRewardService = require("../src/services/worldBossRewardService");
const worldBossRankingService = require("../src/services/worldBossRankingService");
const registerWorldBossHandlers = require("../src/socket/worldBossSocket");
const { emitirTicket } = require("../src/services/socketTicketService");
const { EventEmitter } = require("node:events");
const adminWorldBossService = require("../src/services/adminWorldBossService");
const adminWorldBossEventService = require("../src/services/adminWorldBossEventService");
const worldBossBalanceSimulationService = require("../src/services/worldBossBalanceSimulationService");
const {
  EVENT_STATUS,
  COMBAT_SESSION_STATUS,
  REWARD_KIND,
  PARTICIPATION_REWARDS_STATUS,
} = require("../src/config/worldBossConfig");

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
const powersCriados = [];

// Tudo que participa do índice único parcial (eventos) OU da roleta de
// seleção de config (worldBossLifecycleService.selecionarConfig lê
// TODO WorldBossConfig ativo=true) precisa sumir a cada teste, não só
// no fim do arquivo — senão um config esquecido de um teste anterior
// pode ser sorteado no lugar do config que o teste seguinte acabou de
// criar.
test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
    await WorldBossRewardGrant.destroy({ where: { event_id: eventosCriados } });
    await WorldBossCombatSession.destroy({ where: { event_id: eventosCriados } });
    await WorldBossContribution.destroy({ where: { event_id: eventosCriados } });
    await WorldBossEvent.destroy({ where: { id: eventosCriados } });
    eventosCriados.length = 0;
  }
  if (configsCriados.length > 0) {
    await WorldBossRankingReward.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossStatusResistance.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossAbility.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossConfigZone.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossPhase.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossConfig.destroy({ where: { id: configsCriados } });
    configsCriados.length = 0;
  }
  if (powersCriados.length > 0) {
    await Power.destroy({ where: { id: powersCriados } });
    powersCriados.length = 0;
  }
  if (itensCriados.length > 0) {
    // Sem ON DELETE CASCADE em character_inventory.id_item (migration
    // baseline) — precisa sumir a linha de posse ANTES do Item, senão
    // o destroy abaixo esbarra na FK (mesma ordem já usada nos outros
    // testes de Boss Global com Items).
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
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

async function criarEventoAtivo({ hpCurrent = 100000, hpMax = 100000, defesa = 0 } = {}) {
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça de teste ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: hpMax,
    defesa,
    mensagem_descoberta: "descoberta",
    mensagem_convocacao: "convocacao",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  const evento = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status: EVENT_STATUS.ACTIVE,
    hp_max: hpMax,
    hp_current: hpCurrent,
    config_snapshot: { nome: config.nome, defesa, fases: [] },
    activated_at: new Date(),
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

// ---------------------------------------------------------------------
// Ameaça Mundial V2 §9.3/§18/§19/§23.1 — snapshot profundo: nunca só
// id_power, sempre os valores efetivos. Editar o catálogo depois nunca
// muda um evento já criado.
// ---------------------------------------------------------------------

testeComBanco("snapshot profundo: agendarProximoCiclo congela atributos/fases/habilidades/resistências/ranking rewards (spec V2 §9.3)", async () => {
  const config = await criarConfig();
  await WorldBossConfig.update(
    { nivel: 50, forca: 120, vitalidade: 100, mana_maxima: 500, intervalo_acao_ms: 3500, reentrada_permitida: true },
    { where: { id: config.id } },
  );
  await config.reload();

  const fase = await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Cataclismo",
    hp_percentual_max: 30,
    dano_min: 170,
    dano_max: 220,
    furia_por_acao_pct: 3,
    limite_furia_pct: null,
  });

  const power = await Power.create({
    nome: `Chamas do Cataclismo ${sufixo()}`,
    descricao: "x",
    tipo_poder: "Ativo",
    escala_atributo: "Inteligencia",
    dano_base: 180,
    custo_mana: 80,
    cooldown: 4,
  });
  powersCriados.push(power.id);
  const ability = await WorldBossAbility.create({
    id_world_boss_config: config.id,
    id_power: power.id,
    peso_uso: 30,
    prioridade: 10,
    tipo_alvo: "N_ALEATORIOS",
    quantidade_alvos: 3,
    escala_com_furia: true,
  });

  await WorldBossStatusResistance.create({ id_world_boss_config: config.id, status_key: "STUN", imune: true, resistencia_pct: 100 });

  const premioItem = await criarItemGolpeFinal();
  await WorldBossRankingReward.create({ id_world_boss_config: config.id, posicao_inicio: 1, posicao_fim: 1, id_item: premioItem.id, quantidade: 1, gold: 500 });

  let evento;
  await sequelize.transaction(async (t) => {
    evento = await worldBossLifecycleService.agendarProximoCiclo(t, { apartirDe: new Date() });
  });
  eventosCriados.push(evento.id);

  const snapshot = evento.config_snapshot;
  assert.equal(snapshot.schema_version, worldBossLifecycleService.SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.nivel, 50);
  assert.equal(snapshot.forca, 120);
  assert.equal(snapshot.mana_maxima, 500);
  assert.equal(snapshot.intervalo_acao_ms, 3500);
  assert.equal(snapshot.reentrada_permitida, true);

  const faseSnapshot = snapshot.fases.find((f) => f.nome_fase === "Cataclismo");
  assert.ok(faseSnapshot);
  assert.equal(faseSnapshot.dano_min, 170);
  assert.equal(faseSnapshot.dano_max, 220);
  assert.equal(faseSnapshot.furia_por_acao_pct, 3);
  assert.equal(faseSnapshot.limite_furia_pct, null);

  assert.equal(snapshot.abilities.length, 1);
  const habilidadeSnapshot = snapshot.abilities[0];
  assert.equal(habilidadeSnapshot.power_snapshot.nome, power.nome);
  assert.equal(habilidadeSnapshot.power_snapshot.dano_base, 180);
  assert.equal(habilidadeSnapshot.power_snapshot.custo_mana, 80);
  assert.equal(habilidadeSnapshot.tipo_alvo, "N_ALEATORIOS");
  assert.equal(habilidadeSnapshot.quantidade_alvos, 3);

  assert.equal(snapshot.status_resistances.length, 1);
  assert.equal(snapshot.status_resistances[0].status_key, "STUN");
  assert.equal(snapshot.status_resistances[0].imune, true);

  assert.equal(snapshot.ranking_rewards.length, 1);
  assert.equal(snapshot.ranking_rewards[0].posicao_inicio, 1);
  assert.equal(snapshot.ranking_rewards[0].gold, 500);

  // Editar o catálogo DEPOIS do evento criado nunca pode mudar o
  // snapshot já congelado (regra central da V1, preservada na V2).
  await WorldBossConfig.update({ forca: 999 }, { where: { id: config.id } });
  await Power.update({ dano_base: 999 }, { where: { id: power.id } });
  await WorldBossAbility.update({ peso_uso: 999 }, { where: { id: ability.id } });
  await evento.reload();
  assert.equal(evento.config_snapshot.forca, 120, "editar o catálogo depois não pode mudar um evento já criado");
  assert.equal(evento.config_snapshot.abilities[0].power_snapshot.dano_base, 180);
  assert.equal(evento.config_snapshot.abilities[0].peso_uso, 30);
});

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

// ---------------------------------------------------------------------
// Fase 4 — Combate
// ---------------------------------------------------------------------

// Combate tem uma chance base mínima de esquiva mesmo com o atacante
// em vantagem total de Agilidade (combatFormulas.chanceDeEsquiva) —
// mesmo padrão de retry já usado em combatBalance.test.js: tenta até
// um golpe acertar (esquivou:false) em vez de assumir 100%.
async function atacarAteAcertar(characterId, maxTentativas = 15) {
  let ultimo = null;
  for (let i = 0; i < maxTentativas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ultimo = await worldBossCombatService.executarAcao(characterId, { tipo: "attack" });
    if (!ultimo.esquivou) return ultimo;
  }
  return ultimo;
}

testeComBanco("combate: entrar() falha quando não há Ameaça Mundial ativa", async () => {
  const { personagem } = await criarPersonagem();
  await assert.rejects(() => worldBossCombatService.entrar(personagem.id), /Não há Ameaça Mundial ativa/);
});

testeComBanco("combate: entrar() cria a sessão, é idempotente, e registra a contribuição do personagem", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  await criarEventoAtivo();

  const primeira = await worldBossCombatService.entrar(personagem.id);
  assert.ok(primeira.sessao.id);
  assert.equal(primeira.status.status, "ACTIVE");

  const segunda = await worldBossCombatService.entrar(personagem.id);
  assert.equal(segunda.sessao.id, primeira.sessao.id);

  const total = await WorldBossCombatSession.count({
    where: { character_id: personagem.id, status: COMBAT_SESSION_STATUS.ATIVO },
  });
  assert.equal(total, 1);

  const contribuicao = await WorldBossContribution.findOne({ where: { character_id: personagem.id } });
  assert.ok(contribuicao);
});

testeComBanco("combate: sair() encerra a sessão ativa", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  await criarEventoAtivo();
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await worldBossCombatService.sair(personagem.id);
  assert.equal(resultado.encerrada, true);

  const ativa = await WorldBossCombatSession.findOne({
    where: { character_id: personagem.id, status: COMBAT_SESSION_STATUS.ATIVO },
  });
  assert.equal(ativa, null);
});

testeComBanco("combate: ataque básico sem sessão ativa é rejeitado", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  await criarEventoAtivo();
  await assert.rejects(
    () => worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" }),
    /não está numa sessão de combate/,
  );
});

testeComBanco("combate: ataque básico reduz o HP global e soma na contribuição, sem tirar vida do jogador (sem retaliação)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 40, forca: 500 });
  const evento = await criarEventoAtivo({ hpCurrent: 100000, hpMax: 100000, defesa: 0 });
  await worldBossCombatService.entrar(personagem.id);
  const vidaAntes = personagem.vida_atual;

  const resultado = await atacarAteAcertar(personagem.id);
  assert.equal(resultado.esquivou, false, "esperava pelo menos um acerto em várias tentativas");
  assert.ok(resultado.dano > 0);
  assert.equal(resultado.lutador.vida_atual, vidaAntes, "boss nunca retalia — vida do jogador não muda");

  await evento.reload();
  assert.equal(Number(evento.hp_current), 100000 - resultado.dano);

  const contribuicao = await WorldBossContribution.findOne({ where: { character_id: personagem.id, event_id: evento.id } });
  assert.equal(Number(contribuicao.damage_total), resultado.dano);
  assert.ok(contribuicao.attacks_count >= 1);
});

testeComBanco("combate: poder sem mana suficiente é rejeitado, e nunca desconta a mana do personagem", async () => {
  const Power = require("../src/models/Power");
  const CharacterAbilities = require("../src/models/CharacterAbilities");

  const { personagem } = await criarPersonagem({ nivel: 30 });
  personagem.mana_atual = 0;
  await personagem.save();
  await criarEventoAtivo();
  await worldBossCombatService.entrar(personagem.id);

  const power = await Power.create({
    nome: `Poder caro ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 999,
    dano_base: 50,
    escala_atributo: "Inteligencia",
    valor_escala: 1,
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });

  await assert.rejects(
    () => worldBossCombatService.executarAcao(personagem.id, { tipo: "power", idPoder: power.id }),
    /Mana insuficiente/,
  );

  await personagem.reload();
  assert.equal(personagem.mana_atual, 0);

  await CharacterAbilities.destroy({ where: { id_power: power.id } });
  await power.destroy();
});

testeComBanco("combate: Golpe Final — overkill nunca conta, evento vira DEFEATED com final_blow_character_id, e a sessão encerra", async () => {
  const { personagem } = await criarPersonagem({ nivel: 50, forca: 999 });
  // HP baixíssimo — qualquer acerto de um personagem forte excede
  // (overkill). O dano creditado tem que ser EXATAMENTE 1 (hp_antes),
  // nunca o dano bruto calculado.
  const evento = await criarEventoAtivo({ hpCurrent: 1, hpMax: 100000, defesa: 0 });
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await atacarAteAcertar(personagem.id);
  assert.equal(resultado.esquivou, false);
  assert.equal(resultado.dano, 1, "overkill não pode vazar pra dentro da contribuição");
  assert.equal(resultado.golpeFinal, true);
  assert.equal(resultado.boss.hp_current, 0);

  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.DEFEATED);
  assert.equal(evento.final_blow_character_id, personagem.id);
  assert.ok(evento.defeated_at);

  const sessao = await WorldBossCombatSession.findOne({ where: { character_id: personagem.id, event_id: evento.id } });
  assert.equal(sessao.status, COMBAT_SESSION_STATUS.ENCERRADA);

  const contribuicao = await WorldBossContribution.findOne({ where: { character_id: personagem.id, event_id: evento.id } });
  assert.equal(Number(contribuicao.damage_total), 1);
});

testeComBanco("combate: ação depois do evento não estar mais ACTIVE é rejeitada e encerra a sessão órfã", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  const evento = await criarEventoAtivo();
  await worldBossCombatService.entrar(personagem.id);

  evento.status = EVENT_STATUS.DEFEATED;
  evento.defeated_at = new Date();
  await evento.save();

  await assert.rejects(
    () => worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" }),
    /não está mais ativa/,
  );

  const sessao = await WorldBossCombatSession.findOne({ where: { character_id: personagem.id, event_id: evento.id } });
  assert.equal(sessao.status, COMBAT_SESSION_STATUS.ENCERRADA);
});

// ---------------------------------------------------------------------
// Fase 5 — Recompensas
// ---------------------------------------------------------------------

async function criarEventoDefeated({
  hpMax = 100000,
  goldDescoberta = 100,
  goldParticipacao = 20,
  xpParticipacao = 50,
  minDanoParticipacao = null,
  discovererId = null,
  finalBlowId = null,
} = {}) {
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça de teste ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: hpMax,
    defesa: 0,
    mensagem_descoberta: "descoberta",
    mensagem_convocacao: "convocacao",
    id_item_golpe_final: item.id,
    gold_descoberta: goldDescoberta,
    gold_participacao: goldParticipacao,
    xp_participacao: xpParticipacao,
    min_dano_participacao: minDanoParticipacao,
  });
  configsCriados.push(config.id);
  const evento = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status: EVENT_STATUS.DEFEATED,
    hp_max: hpMax,
    hp_current: 0,
    config_snapshot: {
      nome: config.nome,
      id_item_golpe_final: item.id,
      gold_descoberta: goldDescoberta,
      gold_participacao: goldParticipacao,
      xp_participacao: xpParticipacao,
      min_dano_participacao: minDanoParticipacao,
    },
    discoverer_character_id: discovererId,
    final_blow_character_id: finalBlowId,
    defeated_at: new Date(),
    participation_rewards_status: PARTICIPATION_REWARDS_STATUS.PENDING,
  });
  eventosCriados.push(evento.id);
  return { evento, item, config };
}

testeComBanco("recompensas: descobridor recebe gold_descoberta uma vez, idempotente em chamadas repetidas", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  personagem.dinheiro = 0;
  await personagem.save();
  const { evento } = await criarEventoDefeated({ goldDescoberta: 250, discovererId: personagem.id });

  await worldBossRewardService.processarRecompensas(evento.id);
  await personagem.reload();
  assert.equal(personagem.dinheiro, 250);

  // segunda chamada — nunca credita de novo.
  await worldBossRewardService.processarRecompensas(evento.id);
  await personagem.reload();
  assert.equal(personagem.dinheiro, 250);

  const grant = await WorldBossRewardGrant.findOne({
    where: { event_id: evento.id, character_id: personagem.id, reward_kind: REWARD_KIND.DISCOVERY },
  });
  assert.equal(grant.status, "Granted");

  await evento.reload();
  assert.equal(evento.participation_rewards_status, PARTICIPATION_REWARDS_STATUS.DONE);
});

testeComBanco("recompensas: golpe final recebe o item do catálogo, uma unidade, idempotente", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const { evento, item } = await criarEventoDefeated({ finalBlowId: personagem.id });

  await worldBossRewardService.processarRecompensas(evento.id);
  let posse = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
  assert.equal(posse.quantidade, 1);

  await worldBossRewardService.processarRecompensas(evento.id);
  posse = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
  assert.equal(posse.quantidade, 1, "chamar de novo não pode duplicar o item do Golpe Final");
});

testeComBanco("recompensas: participação credita gold+XP só pra quem bateu o dano mínimo", async () => {
  const { personagem: qualificado } = await criarPersonagem({ nivel: 10 });
  const { personagem: abaixoDoMinimo } = await criarPersonagem({ nivel: 10 });
  const { personagem: semDano } = await criarPersonagem({ nivel: 10 });
  qualificado.dinheiro = 0;
  abaixoDoMinimo.dinheiro = 0;
  semDano.dinheiro = 0;
  await Promise.all([qualificado.save(), abaixoDoMinimo.save(), semDano.save()]);

  const { evento } = await criarEventoDefeated({
    goldParticipacao: 30,
    xpParticipacao: 40,
    minDanoParticipacao: 100,
  });
  await WorldBossContribution.create({ event_id: evento.id, character_id: qualificado.id, damage_total: 150, attacks_count: 3 });
  await WorldBossContribution.create({ event_id: evento.id, character_id: abaixoDoMinimo.id, damage_total: 50, attacks_count: 2 });
  await WorldBossContribution.create({ event_id: evento.id, character_id: semDano.id, damage_total: 0, attacks_count: 0 });

  const experienciaAntes = qualificado.experiencia;
  await worldBossRewardService.processarRecompensas(evento.id);

  await qualificado.reload();
  await abaixoDoMinimo.reload();
  await semDano.reload();

  assert.equal(qualificado.dinheiro, 30);
  assert.ok(qualificado.experiencia > experienciaAntes);
  assert.equal(abaixoDoMinimo.dinheiro, 0, "abaixo do mínimo não recebe participação");
  assert.equal(semDano.dinheiro, 0, "sem dano nenhum não recebe participação");

  const grantQualificado = await WorldBossRewardGrant.findOne({
    where: { event_id: evento.id, character_id: qualificado.id, reward_kind: REWARD_KIND.PARTICIPATION },
  });
  assert.equal(grantQualificado.status, "Granted");
  const grantAbaixo = await WorldBossRewardGrant.findOne({
    where: { event_id: evento.id, character_id: abaixoDoMinimo.id, reward_kind: REWARD_KIND.PARTICIPATION },
  });
  assert.equal(grantAbaixo, null, "nunca cria nem uma linha Pending pra quem não se qualifica");
});

testeComBanco("recompensas: retomarRecompensasPendentes reprocessa eventos travados em Processing (recovery)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  personagem.dinheiro = 0;
  await personagem.save();
  const { evento } = await criarEventoDefeated({ goldDescoberta: 77, discovererId: personagem.id });

  // Simula um processo que caiu NO MEIO do lote: marca Processing sem
  // nenhum grant concedido ainda.
  evento.participation_rewards_status = PARTICIPATION_REWARDS_STATUS.PROCESSING;
  await evento.save();

  await worldBossRewardService.retomarRecompensasPendentes();

  await personagem.reload();
  assert.equal(personagem.dinheiro, 77);
  await evento.reload();
  assert.equal(evento.participation_rewards_status, PARTICIPATION_REWARDS_STATUS.DONE);
});

testeComBanco("recompensas: evento que ainda não está DEFEATED nunca processa nada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 10 });
  const evento = await criarEventoAtivo();
  evento.discoverer_character_id = personagem.id;
  await evento.save();

  const resultado = await worldBossRewardService.processarRecompensas(evento.id);
  assert.equal(resultado, null);

  const grant = await WorldBossRewardGrant.findOne({ where: { event_id: evento.id } });
  assert.equal(grant, null);
});

// ---------------------------------------------------------------------
// Fase 6 — Admin (catálogo + operação do ciclo atual)
// ---------------------------------------------------------------------

async function payloadConfigAdmin(overrides = {}) {
  const item = await criarItemGolpeFinal();
  const zona = await criarZona();
  return {
    payload: {
      nome: `Ameaça de teste ${sufixo()}`,
      descricao: "teste admin",
      vida_base: 50000,
      defesa: 5,
      mensagem_descoberta: "descoberta",
      mensagem_convocacao: "convocacao",
      id_item_golpe_final: item.id,
      gold_descoberta: 10,
      gold_participacao: 5,
      xp_participacao: 15,
      fases: [
        { ordem: 1, nome_fase: "Fase 1", hp_percentual_max: 100 },
        { ordem: 2, nome_fase: "Fase 2", hp_percentual_max: 25, modificador_dano_percentual: 15 },
      ],
      zonas: [zona.id],
      ...overrides,
    },
    zona,
  };
}

testeComBanco("admin catálogo: createAdminWorldBossConfig cria config com fases e zonas aninhadas", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();

  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  assert.equal(criado.nome, payload.nome);
  assert.equal(criado.fases.length, 2);
  assert.deepEqual(criado.zonas, payload.zonas);
  assert.equal(criado.ativo, true);
});

testeComBanco("admin catálogo: updateAdminWorldBossConfig substitui fases/zonas quando enviadas", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  const outraZona = await criarZona();
  const atualizado = await adminWorldBossService.updateAdminWorldBossConfig(
    criado.id,
    { defesa: 42, fases: [{ ordem: 1, nome_fase: "Fase Única", hp_percentual_max: 100 }], zonas: [outraZona.id] },
    { idAdmin: usuario.id },
  );

  assert.equal(atualizado.defesa, 42);
  assert.equal(atualizado.fases.length, 1);
  assert.equal(atualizado.fases[0].nome_fase, "Fase Única");
  assert.deepEqual(atualizado.zonas, [outraZona.id]);
});

testeComBanco("admin catálogo: duplicateAdminWorldBossConfig cria cópia INATIVA com as mesmas fases/zonas", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const original = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(original.id);

  const copia = await adminWorldBossService.duplicateAdminWorldBossConfig(original.id, { idAdmin: usuario.id });
  configsCriados.push(copia.id);

  assert.notEqual(copia.id, original.id);
  assert.equal(copia.ativo, false);
  assert.equal(copia.fases.length, original.fases.length);
  assert.deepEqual(copia.zonas, original.zonas);
});

testeComBanco("admin catálogo: listAdminWorldBossConfigs devolve fases_count/zonas_count (nunca os arrays completos — evita N+1)", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  const pagina = await adminWorldBossService.listAdminWorldBossConfigs({ nome: criado.nome });
  assert.equal(pagina.total, 1);
  const linha = pagina.itens[0];
  assert.equal(linha.id, criado.id);
  assert.equal(linha.fases_count, criado.fases.length);
  assert.equal(linha.zonas_count, criado.zonas.length);
  assert.equal(linha.fases, undefined);
  assert.equal(linha.zonas, undefined);
});

testeComBanco("admin catálogo: setAtivoAdminWorldBossConfig alterna ativo/inativo", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  const desativado = await adminWorldBossService.setAtivoAdminWorldBossConfig(criado.id, false, { idAdmin: usuario.id });
  assert.equal(desativado.ativo, false);
  const reativado = await adminWorldBossService.setAtivoAdminWorldBossConfig(criado.id, true, { idAdmin: usuario.id });
  assert.equal(reativado.ativo, true);
});

testeComBanco("admin catálogo: updateAdminWorldBossSettings rejeita discovery_threshold_min > max", async () => {
  const { usuario } = await criarPersonagem();
  await assert.rejects(
    () =>
      adminWorldBossService.updateAdminWorldBossSettings(
        { "worldboss.discovery_threshold_min": 200, "worldboss.discovery_threshold_max": 100 },
        { idAdmin: usuario.id },
      ),
    /não pode ser maior/,
  );
});

testeComBanco("admin evento atual: força DORMANT->DISCOVERED, depois DISCOVERED->ACTIVE, com motivo obrigatório", async () => {
  const { usuario } = await criarPersonagem();
  const { personagem } = await criarPersonagem();
  const evento = await criarEventoDormant({
    config: await criarConfig(),
    threshold: 999,
  });

  await assert.rejects(
    () => adminWorldBossEventService.forcarDescoberta({ characterId: personagem.id, idAdmin: usuario.id }),
    /motivo é obrigatório/,
  );

  const descoberto = await adminWorldBossEventService.forcarDescoberta({
    characterId: personagem.id,
    motivo: "demonstração",
    idAdmin: usuario.id,
  });
  assert.equal(descoberto.status, EVENT_STATUS.DISCOVERED);
  assert.equal(descoberto.discoverer_character_id, personagem.id);

  const despertado = await adminWorldBossEventService.despertarManualmente({ motivo: "demonstração", idAdmin: usuario.id });
  assert.equal(despertado.id, evento.id);
  assert.equal(despertado.status, EVENT_STATUS.ACTIVE);
  assert.ok(despertado.activated_at);
});

testeComBanco("admin evento atual: cancelarCicloAtual cancela o evento aberto e getStatusOperacional reflete", async () => {
  const { usuario } = await criarPersonagem();
  const config = await criarConfig();
  const evento = await criarEventoDormant({ config, threshold: 10 });

  const statusAntes = await adminWorldBossEventService.getStatusOperacional();
  assert.equal(statusAntes.status, EVENT_STATUS.DORMANT);
  assert.equal(statusAntes.id, evento.id);
  // getStatusOperacional é a view ADMIN — ao contrário da pública, ela
  // revela o threshold secreto.
  assert.equal(statusAntes.discovery_threshold, 10);

  const cancelado = await adminWorldBossEventService.cancelarCicloAtual({ motivo: "limpando pra outro teste", idAdmin: usuario.id });
  assert.equal(cancelado.id, evento.id);
  assert.equal(cancelado.status, EVENT_STATUS.CANCELLED);

  const statusDepois = await adminWorldBossEventService.getStatusOperacional();
  assert.equal(statusDepois.status, "Nenhum");
});

// ---------------------------------------------------------------------
// Ameaça Mundial V2 — Etapa 3: Runtime persistente (relógio global do
// Boss, §3.2/§5/§9). Mesmo arquivo/invariante de evento único aberto
// que o resto desta suíte (ver comentário no topo do arquivo).
// ---------------------------------------------------------------------

async function comMathRandomFixo(valor, fn) {
  const original = Math.random;
  Math.random = () => valor;
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

function comMathRandomFixoSync(valor, fn) {
  const original = Math.random;
  Math.random = () => valor;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

// Snapshot mínimo pra exercitar o relógio: 2 fases (uma com limite de
// Fúria, outra soft-enrage sem limite) — mesmo par de exemplo da
// especificação (§5.4).
function snapshotV2({
  forca = 0,
  agilidade = 0,
  inteligencia = 0,
  vitalidade = 0,
  nivel = 1,
  defesa = 0,
  manaMaxima = 0,
  regenManaPorAcao = 0,
  intervaloAcaoMs = 3000,
  fases,
  abilities = [],
} = {}) {
  return {
    nome: "Ameaça V2 Teste",
    defesa,
    forca,
    agilidade,
    inteligencia,
    vitalidade,
    nivel,
    mana_maxima: manaMaxima,
    regeneracao_mana_por_acao: regenManaPorAcao,
    intervalo_acao_ms: intervaloAcaoMs,
    // id (Etapa 5, §6.2) — fases_permitidas de WorldBossAbility referencia
    // id de WorldBossPhase, não ordem; os testes de habilidade usam esses
    // ids fixos (1/2) pra montar fases_permitidas.
    fases: fases ?? [
      { id: 1, ordem: 1, nome_fase: "Fase 1", hp_percentual_max: 100, modificador_dano_percentual: 0, dano_min: 10, dano_max: 10, furia_por_acao_pct: 5, limite_furia_pct: 20, intervalo_acao_ms: null, mana_ao_entrar: null, texto_alerta: null },
      { id: 2, ordem: 2, nome_fase: "Fase 2 - Enrage", hp_percentual_max: 30, modificador_dano_percentual: 0, dano_min: 10, dano_max: 10, furia_por_acao_pct: 5, limite_furia_pct: null, intervalo_acao_ms: 500, mana_ao_entrar: 999, texto_alerta: "Ela enfurece!" },
    ],
    abilities,
  };
}

// Ameaça Mundial V2 — Etapa 5 (§6.2): uma entrada de snapshot.abilities
// já no formato CONGELADO (o que worldBossLifecycleService.montarSnapshot
// produziria a partir de WorldBossAbility+Power reais).
function habilidadeSnapshot({
  idAbility = 1,
  danoBase = 20,
  curaBase = 0,
  custoMana = 10,
  cooldown = 0,
  escalaAtributo = "Forca",
  valorEscala = 1,
  pesoUso = 1,
  prioridade = 0,
  fasesPermitidas = null,
  tipoAlvo = "ALEATORIO",
  quantidadeAlvos = null,
  tempoConjuracaoMs = 0,
  cooldownOverride = null,
  custoManaOverride = null,
  escalaComFuria = true,
} = {}) {
  return {
    id_ability: idAbility,
    power_snapshot: {
      id: 900 + idAbility,
      nome: `Habilidade ${idAbility}`,
      imagem_url: null,
      dano_base: danoBase,
      cura_base: curaBase,
      custo_mana: custoMana,
      cooldown,
      escala_atributo: escalaAtributo,
      valor_escala: valorEscala,
    },
    peso_uso: pesoUso,
    prioridade,
    fases_permitidas: fasesPermitidas,
    tipo_alvo: tipoAlvo,
    quantidade_alvos: quantidadeAlvos,
    tempo_conjuracao_ms: tempoConjuracaoMs,
    cooldown_override: cooldownOverride,
    custo_mana_override: custoManaOverride,
    escala_com_furia: escalaComFuria,
  };
}

async function criarEventoAtivoV2({ hpCurrent = 1000, hpMax = 1000, nextActionAt = new Date(0), snapshotOverrides = {} } = {}) {
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça V2 Teste ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: hpMax,
    defesa: 0,
    mensagem_descoberta: "descoberta",
    mensagem_convocacao: "convocacao",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  const evento = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status: EVENT_STATUS.ACTIVE,
    hp_max: hpMax,
    hp_current: hpCurrent,
    config_snapshot: snapshotV2(snapshotOverrides),
    activated_at: new Date(),
    next_action_at: nextActionAt,
  });
  eventosCriados.push(evento.id);
  return evento;
}

testeComBanco("runtime: sem evento ACTIVE, processarProximaAcao é no-op (nunca lança)", async () => {
  const resultado = await worldBossRuntimeService.processarProximaAcao();
  assert.equal(resultado, null);
});

testeComBanco("runtime: next_action_at no futuro é no-op — nada avança", async () => {
  const evento = await criarEventoAtivoV2({ nextActionAt: new Date(Date.now() + 60_000) });
  const resultado = await worldBossRuntimeService.processarProximaAcao();
  assert.equal(resultado, null);

  await evento.reload();
  assert.equal(evento.boss_action_seq, 0);
});

testeComBanco("runtime: ação avança boss_action_seq/phase_action_seq e agenda next_action_at no futuro", async () => {
  const antes = new Date();
  const evento = await criarEventoAtivoV2();

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.ok(resultado, "esperava uma ação processada");
  assert.equal(resultado.boss_action_seq, 1);
  assert.equal(resultado.phase_action_seq, 1);

  await evento.reload();
  assert.equal(evento.boss_action_seq, 1);
  assert.equal(evento.phase_action_seq, 1);
  assert.ok(new Date(evento.next_action_at).getTime() > antes.getTime(), "next_action_at precisa ficar no futuro");
});

testeComBanco("runtime: Fúria cresce com o limite da fase respeitado (fase 1, limite 20%)", async () => {
  const evento = await criarEventoAtivoV2();

  // furia_por_acao_pct=5, limite=20 — depois de 3 ações: min(3*5,20)=15.
  for (let i = 0; i < 3; i++) {
    // eslint-disable-next-line no-await-in-loop -- precisa ser sequencial (mesmo relógio)
    await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
    // eslint-disable-next-line no-await-in-loop
    await WorldBossEvent.update({ next_action_at: new Date(0) }, { where: { id: evento.id } });
  }
  await evento.reload();
  assert.equal(Number(evento.furia_current_pct), 15);

  // Mais 2 ações (total 5): min(5*5,20)=25 estourava o limite -> capado em 20.
  for (let i = 0; i < 2; i++) {
    // eslint-disable-next-line no-await-in-loop
    await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
    // eslint-disable-next-line no-await-in-loop
    await WorldBossEvent.update({ next_action_at: new Date(0) }, { where: { id: evento.id } });
  }
  await evento.reload();
  assert.equal(Number(evento.furia_current_pct), 20, "Fúria não pode passar do limite_furia_pct da fase");
});

testeComBanco("runtime: Fúria sem limite (soft-enrage) continua escalando sem cap", async () => {
  // HP já dentro da Fase 2 (hp_percentual_max=30, sem limite_furia_pct)
  // desde a primeira ação.
  const evento = await criarEventoAtivoV2({ hpCurrent: 200, hpMax: 1000 });

  for (let i = 0; i < 6; i++) {
    // eslint-disable-next-line no-await-in-loop
    await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
    // eslint-disable-next-line no-await-in-loop
    await WorldBossEvent.update({ next_action_at: new Date(0) }, { where: { id: evento.id } });
  }
  await evento.reload();
  // furia_por_acao_pct=5, 6 ações, sem cap: 6*5=30 (> 20, o limite da fase 1).
  assert.equal(Number(evento.furia_current_pct), 30);
});

testeComBanco("runtime: cruzar o limiar de HP troca de fase, reseta phase_action_seq/Fúria e aplica novo intervalo", async () => {
  // Começa na Fase 1 (100%) com HP logo acima do limiar da Fase 2 (30%).
  // mana_maxima >= mana_ao_entrar(999) da Fase 2, senão o clamp de
  // "nunca passar do máximo" (esperado, §6.5) capava o valor sozinho.
  const evento = await criarEventoAtivoV2({ hpCurrent: 310, hpMax: 1000, snapshotOverrides: { manaMaxima: 999 } });

  // Uma ação ainda na Fase 1 pra acumular Fúria.
  await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  await evento.reload();
  assert.equal(evento.phase_action_seq, 1);
  assert.ok(Number(evento.furia_current_pct) > 0);

  // Zera o HP global manualmente pra simular jogadores derrubando o
  // boss abaixo de 30% (o runtime não sabe fazer isso sozinho ainda —
  // isso é worldBossCombatService, não a Etapa 3) e libera o relógio.
  await WorldBossEvent.update({ hp_current: 290, next_action_at: new Date(0) }, { where: { id: evento.id } });

  await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  await evento.reload();
  assert.equal(evento.runtime_state.fase_atual_ordem, 2, "precisa ter entrado na Fase 2");
  assert.equal(evento.phase_action_seq, 1, "phase_action_seq reseta ao trocar de fase");
  assert.equal(Number(evento.furia_current_pct), 5, "Fúria reseta e recomeça a contar na fase nova");
  assert.equal(evento.mana_current, 999, "mana_ao_entrar da Fase 2 precisa ter sido aplicado");

  // O intervalo da PRÓXIMA ação precisa refletir o override da Fase 2
  // (500ms), não mais o intervalo base do catálogo (3000ms).
  const proximaEm = new Date(evento.next_action_at).getTime() - Date.now();
  assert.ok(proximaEm <= 600, `esperava próxima ação em ~500ms, ficou em ${proximaEm}ms`);
});

testeComBanco("runtime: ataque básico atinge um participante Ativo aleatório e aplica dano/mitigação de defesa", async () => {
  const { personagem } = await criarPersonagem();
  personagem.defesa = 0;
  personagem.vida_atual = 9999;
  await personagem.save();

  const evento = await criarEventoAtivoV2();
  await worldBossCombatService.entrar(personagem.id);

  const vidaAntes = personagem.vida_atual;
  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());

  assert.ok(resultado.alvo, "esperava um alvo selecionado (só há 1 participante Ativo)");
  assert.equal(resultado.alvo.character_id, personagem.id);
  assert.equal(resultado.alvo.esquivou, false, "Math.random()=0.99 garante acerto");
  assert.ok(resultado.alvo.dano > 0);

  await personagem.reload();
  assert.equal(personagem.vida_atual, vidaAntes - resultado.alvo.dano);
});

testeComBanco("runtime: dano do boss não pode derrubar HP do alvo abaixo de zero, e zera-lo marca a sessão DERROTADO", async () => {
  const { personagem } = await criarPersonagem();
  personagem.defesa = 0;
  personagem.vida_atual = 3; // menos que o dano fixo de 10 da fase de teste
  await personagem.save();

  const evento = await criarEventoAtivoV2();
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.equal(resultado.alvo.vida_atual, 0, "HP nunca pode ficar negativo");
  assert.equal(resultado.alvo.derrotado, true);

  await personagem.reload();
  assert.equal(personagem.vida_atual, 0);

  const sessao = await WorldBossCombatSession.findOne({ where: { event_id: evento.id, character_id: personagem.id } });
  assert.equal(sessao.status, COMBAT_SESSION_STATUS.DERROTADO);
  assert.ok(sessao.derrotado_at);
});

// Personagem não tem "defesa" base própria — vem inteiramente do
// equipamento (equipmentBonusService.personagemComBonus). Montar um set
// equipado de verdade só pra isso infla o teste sem testar nada que
// aplicarMitigacaoDeDefesa (combatFormulas, já testada à parte) não
// cubra sozinha; aqui o que importa pra Etapa 3 é só confirmar que o
// runtime CHAMA a mitigação com o alvoDefesa certo — testado direto
// contra a função exportada, sem precisar de Character/equipamento.
test("runtime: resolverDanoBasico aplica mitigação de defesa do alvo (defesa alta reduz o dano)", () => {
  const snapshot = snapshotV2();
  const fase = snapshot.fases[0];

  const semDefesa = comMathRandomFixoSync(0.99, () =>
    worldBossRuntimeService.resolverDanoBasico({ snapshot, fase, furiaPct: 0, alvoBase: { agilidade: 0 }, alvoDefesa: 0 }),
  );
  const comDefesa = comMathRandomFixoSync(0.99, () =>
    worldBossRuntimeService.resolverDanoBasico({ snapshot, fase, furiaPct: 0, alvoBase: { agilidade: 0 }, alvoDefesa: 100 }),
  );

  assert.equal(semDefesa.esquivou, false);
  assert.equal(comDefesa.esquivou, false);
  assert.ok(comDefesa.dano < semDefesa.dano, "defesa alta precisa reduzir o dano recebido do boss");
});

testeComBanco("runtime: concorrência — dois workers processando o mesmo tick só avançam boss_action_seq uma vez", async () => {
  const evento = await criarEventoAtivoV2();

  await comMathRandomFixo(0.99, () =>
    Promise.all([worldBossRuntimeService.processarProximaAcao(), worldBossRuntimeService.processarProximaAcao()]),
  );

  await evento.reload();
  assert.equal(evento.boss_action_seq, 1, "dois workers no mesmo instante não podem duplicar a ação do boss");
});

testeComBanco("runtime: faseAtualDe/furiaPctDe são funções puras determinísticas (sem banco)", () => {
  const fases = snapshotV2().fases;
  assert.equal(worldBossRuntimeService.faseAtualDe(fases, 100).ordem, 1);
  assert.equal(worldBossRuntimeService.faseAtualDe(fases, 30).ordem, 2);
  assert.equal(worldBossRuntimeService.faseAtualDe(fases, 0).ordem, 2);
  assert.equal(worldBossRuntimeService.faseAtualDe([], 50), null);

  assert.equal(worldBossRuntimeService.furiaPctDe(3, fases[0]), 15);
  assert.equal(worldBossRuntimeService.furiaPctDe(10, fases[0]), 20, "capado pelo limite_furia_pct=20 da fase 1");
  assert.equal(worldBossRuntimeService.furiaPctDe(10, fases[1]), 50, "fase 2 não tem limite (null) — nunca capa");
});

// Ameaça Mundial V2 — Etapa 4: socket autenticado (§17/§20). Testado
// contra o MÓDULO REAL (registerWorldBossHandlers), sem subir servidor
// HTTP/rede de verdade: um `io` e um `socket` fake bastam porque
// socket.io-client não está instalado neste projeto e um Socket real do
// lado do servidor já é, por construção, um EventEmitter — `.on(evento,
// handler)` registra exatamente como o real, e simular "o cliente
// mandou uma mensagem com ack" é só chamar `.emit(evento, payload,
// callback)` no mesmo objeto (é assim que o socket.io despacha um
// packet recebido por baixo dos panos). O objetivo aqui é validar §20:
// "cliente não consegue agir por outro characterId nem enviar dano
// arbitrário" — nunca reimplementar a lógica dos handlers, só invocar a
// de produção.
function criarIoFake() {
  const listenersDeConexao = [];
  const io = {
    on(evento, callback) {
      if (evento === "connection") listenersDeConexao.push(callback);
    },
    to() {
      return { emit() {} };
    },
  };
  return { io, conectar: (socket) => listenersDeConexao.forEach((cb) => cb(socket)) };
}

function criarSocketFake() {
  const socket = new EventEmitter();
  socket.rooms = new Set();
  socket.join = (sala) => socket.rooms.add(sala);
  socket.leave = (sala) => socket.rooms.delete(sala);
  return socket;
}

function dispararComAck(socket, evento, payload) {
  return new Promise((resolve, reject) => {
    if (socket.listenerCount(evento) === 0) return reject(new Error(`sem handler pra "${evento}"`));
    socket.emit(evento, payload, resolve);
  });
}

testeComBanco("socket: worldboss:acao sem se identificar antes é sempre rejeitado", async () => {
  const { io, conectar } = criarIoFake();
  registerWorldBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const resposta = await dispararComAck(socket, "worldboss:acao", { tipo: "attack" });
  assert.equal(resposta.accepted, false);
  assert.match(resposta.erro, /identifique/i);
});

testeComBanco("socket: worldboss:identificar com ticket inválido nunca seta characterId", async () => {
  const { io, conectar } = criarIoFake();
  registerWorldBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const resposta = await dispararComAck(socket, "worldboss:identificar", { ticket: "ticket-forjado-invalido" });
  assert.ok(resposta.erro, "ticket inválido precisa devolver erro, nunca um ok silencioso");
  assert.equal(socket.characterId, undefined);
});

testeComBanco("socket: worldboss:identificar com ticket válido seta o characterId do DONO do ticket, nunca outro", async () => {
  const { personagem } = await criarPersonagem();
  const { io, conectar } = criarIoFake();
  registerWorldBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const ticket = emitirTicket(personagem.id_usuario);
  const resposta = await dispararComAck(socket, "worldboss:identificar", { ticket });
  assert.equal(resposta.ok, true);
  assert.equal(socket.characterId, String(personagem.id));
});

testeComBanco("socket: worldboss:acao só age pelo characterId do ticket — um characterId enviado no payload é ignorado", async () => {
  await criarEventoAtivoV2();
  const { personagem: dono } = await criarPersonagem();
  const { personagem: outro } = await criarPersonagem();

  const { io, conectar } = criarIoFake();
  registerWorldBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const ticket = emitirTicket(dono.id_usuario);
  await dispararComAck(socket, "worldboss:identificar", { ticket });
  // Dono nunca entrou em combate (sem sessão Ativa) — se o servidor
  // fosse ler o characterId forjado no payload, agiria como "outro"
  // (que também não tem sessão, mas é OUTRO personagem) em vez de
  // rejeitar corretamente pela falta de sessão do dono de verdade.
  const resposta = await dispararComAck(socket, "worldboss:acao", {
    characterId: outro.id,
    character_id: outro.id,
    tipo: "attack",
  });
  assert.equal(resposta.accepted, false);
  assert.match(resposta.erro, /sessão de combate/i);

  const sessaoDoOutro = await WorldBossCombatSession.findOne({ where: { character_id: outro.id } });
  assert.equal(sessaoDoOutro, null, "characterId forjado no payload nunca pode criar/afetar sessão de OUTRO personagem");
});

testeComBanco("socket: worldboss:entrar-combate exige identificação prévia", async () => {
  await criarEventoAtivoV2();
  const { io, conectar } = criarIoFake();
  registerWorldBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const resposta = await dispararComAck(socket, "worldboss:entrar-combate", {});
  assert.equal(resposta.ok, false);
  assert.match(resposta.erro, /identifique/i);
});

testeComBanco("socket: client_action_id repetido devolve a MESMA resposta sem reprocessar a ação (nunca dobra o dano)", async () => {
  const evento = await criarEventoAtivoV2({ hpCurrent: 1000, hpMax: 1000 });
  const { personagem } = await criarPersonagem({ nivel: 20 });

  const { io, conectar } = criarIoFake();
  registerWorldBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const ticket = emitirTicket(personagem.id_usuario);
  await dispararComAck(socket, "worldboss:identificar", { ticket });
  await dispararComAck(socket, "worldboss:entrar-combate", {});

  const primeira = await dispararComAck(socket, "worldboss:acao", { client_action_id: "acao-1", tipo: "attack" });
  assert.equal(primeira.accepted, true);

  await evento.reload();
  const hpDepoisDaPrimeira = evento.hp_current;

  const repetida = await dispararComAck(socket, "worldboss:acao", { client_action_id: "acao-1", tipo: "attack" });
  assert.deepEqual(repetida, primeira, "o mesmo client_action_id precisa devolver o ack idêntico já dado, nunca reprocessar");

  await evento.reload();
  assert.equal(evento.hp_current, hpDepoisDaPrimeira, "reenviar o mesmo client_action_id nunca pode aplicar dano de novo");

  const diferente = await dispararComAck(socket, "worldboss:acao", { client_action_id: "acao-2", tipo: "attack" });
  assert.equal(diferente.accepted, true);
  assert.notEqual(diferente.server_action_seq, primeira.server_action_seq, "um client_action_id NOVO precisa processar uma ação nova de verdade");
});

// Ameaça Mundial V2 — Etapa 5: Habilidades do Boss + IA (§6).

test("habilidadesElegiveis: filtra por fase (id, não ordem), cooldown e Mana", () => {
  const habComFase2Só = habilidadeSnapshot({ idAbility: 1, fasesPermitidas: [2] });
  const habSemRestricaoDeFase = habilidadeSnapshot({ idAbility: 2, fasesPermitidas: null });
  const habCara = habilidadeSnapshot({ idAbility: 3, custoMana: 999 });
  const habEmCooldown = habilidadeSnapshot({ idAbility: 4 });

  const elegiveis = worldBossRuntimeService.habilidadesElegiveis(
    [habComFase2Só, habSemRestricaoDeFase, habCara, habEmCooldown],
    { faseId: 1, manaAtual: 50, cooldowns: { "4": 10 }, bossActionSeqDaAcao: 5 },
  );

  assert.deepEqual(elegiveis.map((h) => h.id_ability), [2], "só a habilidade sem fasesPermitidas passa: a de fase 2 não bate com faseId=1, a cara não tem Mana, a 4 está em cooldown até seq 10");
});

test("escolherHabilidade: só sorteia entre a maior prioridade elegível, nunca entre todas", () => {
  const baixaPrioridade = habilidadeSnapshot({ idAbility: 1, prioridade: 0 });
  const altaPrioridadeA = habilidadeSnapshot({ idAbility: 2, prioridade: 5, pesoUso: 1 });
  const altaPrioridadeB = habilidadeSnapshot({ idAbility: 3, prioridade: 5, pesoUso: 999 });

  for (let i = 0; i < 20; i++) {
    const escolhida = comMathRandomFixoSync(0.01 + i * 0.04, () =>
      worldBossRuntimeService.escolherHabilidade([baixaPrioridade, altaPrioridadeA, altaPrioridadeB]),
    );
    assert.notEqual(escolhida.id_ability, 1, "a de prioridade 0 nunca pode ser sorteada enquanto houver uma de prioridade 5 elegível");
  }
});

testeComBanco("runtime: habilidade elegível (Mana suficiente, sem cooldown) substitui o ataque básico", async () => {
  const { personagem } = await criarPersonagem();
  personagem.defesa = 0;
  personagem.vida_atual = 9999;
  await personagem.save();

  const habilidade = habilidadeSnapshot({ idAbility: 1, danoBase: 30, custoMana: 15 });
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidade] } });
  await WorldBossEvent.update({ mana_current: 100 }, { where: { id: evento.id } });
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());

  assert.ok(resultado.habilidade, "esperava a IA usar a habilidade em vez do ataque básico");
  assert.equal(resultado.habilidade.id_ability, 1);
  assert.equal(resultado.alvo, undefined, "não é o caminho de ataque básico");
  assert.equal(resultado.habilidade.alvos.length, 1);
  assert.ok(resultado.habilidade.alvos[0].dano > 0);

  await evento.reload();
  assert.equal(evento.mana_current, 100 - 15, "custo de Mana da habilidade precisa ser descontado da reserva do Boss");

  await personagem.reload();
  assert.equal(personagem.vida_atual, 9999 - resultado.habilidade.alvos[0].dano);
});

testeComBanco("runtime: sem Mana suficiente pra nenhuma habilidade, a IA cai pro ataque básico", async () => {
  const { personagem } = await criarPersonagem();
  personagem.vida_atual = 9999;
  await personagem.save();

  const habilidadeCara = habilidadeSnapshot({ idAbility: 1, custoMana: 999 });
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidadeCara] } });
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.equal(resultado.habilidade, undefined);
  assert.ok(resultado.alvo, "sem Mana suficiente, precisa cair pro ataque básico");

  await evento.reload();
  assert.equal(evento.mana_current, 0, "habilidade nunca usada nunca desconta Mana nenhuma");
});

testeComBanco("runtime: habilidade fora da fase atual nunca é escolhida mesmo com Mana de sobra", async () => {
  const { personagem } = await criarPersonagem();
  personagem.vida_atual = 9999;
  await personagem.save();

  // fase atual (hp 100%) é a de id=1 no snapshot padrão; restringe a
  // habilidade só pra fase id=2 (Enrage) — nunca deve ser elegível aqui.
  // custoMana=0 de propósito: só a fase pode ser o motivo da rejeição
  // aqui, nunca falta de Mana (senão o teste passaria pelo motivo errado).
  const habilidadeSoOutraFase = habilidadeSnapshot({ idAbility: 1, custoMana: 0, fasesPermitidas: [2] });
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidadeSoOutraFase] } });
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.equal(resultado.habilidade, undefined);
  assert.ok(resultado.alvo, "habilidade da fase errada precisa ser ignorada, caindo pro ataque básico");
});

testeComBanco("runtime: habilidade some da rotação durante o cooldown e volta a ficar elegível depois de N ações", async () => {
  const { personagem } = await criarPersonagem();
  personagem.vida_atual = 999999;
  await personagem.save();

  // custoManaOverride=0 pra Mana nunca ser o motivo de cair pro básico —
  // só o cooldown decide aqui. cooldownOverride=1 bloqueia exatamente a
  // 1 próxima ação (mesma semântica de cooldownService.js).
  const habilidade = habilidadeSnapshot({ idAbility: 1, custoMana: 0, cooldownOverride: 1 });
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidade] } });
  await worldBossCombatService.entrar(personagem.id);

  const primeira = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.ok(primeira.habilidade, "primeira ação: habilidade sem cooldown nenhum, precisa ser usada");

  await WorldBossEvent.update({ next_action_at: new Date(0) }, { where: { id: evento.id } });
  const segunda = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.equal(segunda.habilidade, undefined, "cooldown=1 precisa bloquear EXATAMENTE a próxima ação");
  assert.ok(segunda.alvo, "com a única habilidade em cooldown, cai pro ataque básico");

  await WorldBossEvent.update({ next_action_at: new Date(0) }, { where: { id: evento.id } });
  const terceira = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.ok(terceira.habilidade, "depois de exatamente 1 ação de cooldown, a habilidade volta a ficar elegível");
});

testeComBanco("runtime: tipo_alvo SELF cura o próprio Boss, nunca escala com Fúria e nunca toca em jogador nenhum", async () => {
  const { personagem } = await criarPersonagem();
  const vidaAntesDoPersonagem = personagem.vida_atual;

  const habilidadeDeCura = habilidadeSnapshot({
    idAbility: 1,
    danoBase: 0,
    curaBase: 50,
    custoMana: 0,
    tipoAlvo: "SELF",
    escalaComFuria: true, // §5.5 — precisa ser ignorado mesmo assim: cura nunca escala com Fúria.
  });
  const evento = await criarEventoAtivoV2({ hpCurrent: 500, hpMax: 1000, snapshotOverrides: { manaMaxima: 100, abilities: [habilidadeDeCura] } });
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.ok(resultado.habilidade, "esperava a IA usar a cura SELF");
  assert.equal(resultado.habilidade.alvos.length, 0, "SELF não tem alvo de jogador nenhum");
  assert.ok(resultado.habilidade.cura_self > 0);

  await evento.reload();
  // hp_current é BIGINT — Sequelize/pg devolve como string pra não
  // perder precisão; Number(...) antes de comparar (mesmo cuidado já
  // necessário em qualquer leitura de BIGINT deste projeto).
  assert.equal(Number(evento.hp_current), 500 + resultado.habilidade.cura_self);

  await personagem.reload();
  assert.equal(personagem.vida_atual, vidaAntesDoPersonagem, "cura SELF do Boss nunca pode tocar na vida de um jogador");
});

testeComBanco("runtime: cast com tempo_conjuracao_ms > 0 só aplica dano quando resolves_at chega (telegraph antes)", async () => {
  const { personagem } = await criarPersonagem();
  personagem.defesa = 0;
  personagem.vida_atual = 9999;
  await personagem.save();

  const habilidadeComCast = habilidadeSnapshot({ idAbility: 1, danoBase: 40, custoMana: 0, tempoConjuracaoMs: 5000 });
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidadeComCast] } });
  await worldBossCombatService.entrar(personagem.id);

  const inicioCast = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.ok(inicioCast.castIniciado, "esperava o telegraph do cast, não o dano ainda");
  assert.equal(inicioCast.habilidade, undefined, "cast em andamento não resolve efeito nenhum nesse mesmo tick");

  await personagem.reload();
  assert.equal(personagem.vida_atual, 9999, "nenhum dano antes do cast resolver");

  await evento.reload();
  assert.ok(evento.runtime_state.cast_pendente, "cast precisa sobreviver persistido, nunca só em memória");
  assert.equal(new Date(evento.next_action_at).getTime(), new Date(inicioCast.castIniciado.resolves_at).getTime());

  // Chamar de novo ANTES do prazo é no-op — next_action_at ainda no futuro.
  const antesDoPrazo = await worldBossRuntimeService.processarProximaAcao();
  assert.equal(antesDoPrazo, null);

  // Simula o prazo já ter chegado (mesmo mecanismo de "avançar o relógio" já usado nos outros testes de runtime).
  await WorldBossEvent.update({ next_action_at: new Date(0) }, { where: { id: evento.id } });
  const resolucao = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.equal(resolucao.castResolvido, true);
  assert.ok(resolucao.habilidade.alvos[0].dano > 0);

  await personagem.reload();
  assert.equal(personagem.vida_atual, 9999 - resolucao.habilidade.alvos[0].dano);

  await evento.reload();
  assert.equal(evento.runtime_state.cast_pendente, null, "cast resolvido precisa ser limpo do runtime_state");
});

testeComBanco("runtime: cast pendente é descartado (nunca resolvido) se a fase mudar antes do prazo", async () => {
  const { personagem } = await criarPersonagem();
  personagem.defesa = 0;
  personagem.vida_atual = 9999;
  await personagem.save();

  const habilidadeComCast = habilidadeSnapshot({ idAbility: 1, danoBase: 999, custoMana: 0, tempoConjuracaoMs: 5000 });
  // hp 100% -> fase id=1 no início do cast.
  const evento = await criarEventoAtivoV2({ hpCurrent: 1000, hpMax: 1000, snapshotOverrides: { manaMaxima: 100, abilities: [habilidadeComCast] } });
  await worldBossCombatService.entrar(personagem.id);

  const inicioCast = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.ok(inicioCast.castIniciado);

  // Outro jogador (ou o próprio scheduler de outra sessão) derruba o HP
  // pra fase id=2 (<=30%) ENQUANTO o cast ainda está pendente — precisa
  // ser descartado, nunca resolvido com dano da fase antiga.
  await WorldBossEvent.update(
    { hp_current: 200, next_action_at: new Date(0) },
    { where: { id: evento.id } },
  );

  const resultadoAposMudarFase = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.notEqual(resultadoAposMudarFase.castResolvido, true, "cast da fase anterior nunca pode resolver depois da troca de fase");
  assert.equal(resultadoAposMudarFase.mudouFase, true);

  // A habilidade não tem fasesPermitidas (elegível em toda fase), então
  // é normal e correto a IA já iniciar um cast NOVO pra fase atual no
  // mesmo tick em que descarta o antigo — o que nunca pode acontecer é
  // aquele cast ANTIGO (com dano calculado pra fase anterior) sobreviver
  // ou resolver.
  await evento.reload();
  if (evento.runtime_state.cast_pendente) {
    assert.notEqual(
      evento.runtime_state.cast_pendente.started_at,
      inicioCast.castIniciado.started_at,
      "um cast pendente depois da troca de fase só pode ser um cast NOVO, nunca o antigo sobrevivendo",
    );
  }

  await personagem.reload();
  assert.equal(personagem.vida_atual, 9999, "o dano do cast descartado nunca pode ter sido aplicado por engano");
});

testeComBanco("selecionarAlvos: MAIOR_DANO escolhe quem mais contribuiu, não um aleatório", async () => {
  const evento = await criarEventoAtivoV2();
  const { personagem: baixoDano } = await criarPersonagem();
  const { personagem: altoDano } = await criarPersonagem();
  await worldBossCombatService.entrar(baixoDano.id);
  await worldBossCombatService.entrar(altoDano.id);

  await WorldBossContribution.update({ damage_total: 10 }, { where: { event_id: evento.id, character_id: baixoDano.id } });
  await WorldBossContribution.update({ damage_total: 500 }, { where: { event_id: evento.id, character_id: altoDano.id } });

  const alvos = await sequelize.transaction((transaction) =>
    worldBossRuntimeService.selecionarAlvos("MAIOR_DANO", null, evento.id, transaction),
  );
  assert.equal(alvos.length, 1);
  assert.equal(alvos[0].character_id, altoDano.id);
});

testeComBanco("selecionarAlvos: MENOR_VIDA escolhe o participante com menor percentual de HP", async () => {
  const evento = await criarEventoAtivoV2();
  // Mesmos defaults de criarPersonagem() pros dois — vidaMax efetiva
  // igual, então só vida_atual decide o percentual.
  const { personagem: quaseMorto } = await criarPersonagem();
  const { personagem: quaseCheio } = await criarPersonagem();
  await worldBossCombatService.entrar(quaseMorto.id);
  await worldBossCombatService.entrar(quaseCheio.id);

  quaseMorto.vida_atual = 1;
  await quaseMorto.save();

  const alvos = await sequelize.transaction((transaction) =>
    worldBossRuntimeService.selecionarAlvos("MENOR_VIDA", null, evento.id, transaction),
  );
  assert.equal(alvos.length, 1);
  assert.equal(alvos[0].character_id, quaseMorto.id);
});

testeComBanco("selecionarAlvos: TODOS retorna toda sessão Ativa do evento, N_ALEATORIOS respeita a quantidade pedida", async () => {
  const evento = await criarEventoAtivoV2();
  const { personagem: p1 } = await criarPersonagem();
  const { personagem: p2 } = await criarPersonagem();
  const { personagem: p3 } = await criarPersonagem();
  await worldBossCombatService.entrar(p1.id);
  await worldBossCombatService.entrar(p2.id);
  await worldBossCombatService.entrar(p3.id);

  const todos = await sequelize.transaction((transaction) => worldBossRuntimeService.selecionarAlvos("TODOS", null, evento.id, transaction));
  assert.equal(todos.length, 3);

  const doisAleatorios = await sequelize.transaction((transaction) =>
    worldBossRuntimeService.selecionarAlvos("N_ALEATORIOS", 2, evento.id, transaction),
  );
  assert.equal(doisAleatorios.length, 2);
  assert.equal(new Set(doisAleatorios.map((s) => s.character_id)).size, 2, "N_ALEATORIOS nunca pode repetir o mesmo participante");
});

// Ameaça Mundial V2 — Etapa 6: Status/resistência (§7). Reaproveita o
// motor existente (statusEffectService/combatEffectResolver) o tempo
// todo — nada aqui reimplementa duração/potência/stack/tick.

test("aplicarStatusNoBoss: imune bloqueia completamente; resistencia_pct=100 sempre resiste; sem cadastro deixa entrar", () => {
  const instancia = { key: "STUN", sourceActorId: "1", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 1, potency: 0, appliedAtTurn: 1 };

  const comImunidade = worldBossRuntimeService.aplicarStatusNoBoss([], instancia, [{ status_key: "STUN", imune: true, resistencia_pct: 0 }]);
  assert.equal(comImunidade.length, 0);

  const comResistenciaTotal = worldBossRuntimeService.aplicarStatusNoBoss([], instancia, [{ status_key: "STUN", imune: false, resistencia_pct: 100 }]);
  assert.equal(comResistenciaTotal.length, 0);

  const semCadastro = worldBossRuntimeService.aplicarStatusNoBoss([], instancia, []);
  assert.equal(semCadastro.length, 1);
  assert.equal(semCadastro[0].key, "STUN");
});

// Retry até acertar com um PODER (mesmo critério de atacarAteAcertar,
// que só cobre "attack") — chanceDeEsquiva nunca é 0%, mesmo com
// Agilidade em desvantagem total pro alvo.
async function usarPoderAteAcertar(characterId, idPoder, maxTentativas = 15) {
  let ultimo = null;
  for (let i = 0; i < maxTentativas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ultimo = await worldBossCombatService.executarAcao(characterId, { tipo: "power", idPoder });
    if (!ultimo.esquivou) return ultimo;
  }
  return ultimo;
}

testeComBanco("combate: poder do jogador com PowerStatusEffect (Enemy) aplica status no Boss, gated pela resistência dele", async () => {
  const CharacterAbilities = require("../src/models/CharacterAbilities");
  const PowerStatusEffect = require("../src/models/PowerStatusEffect");

  const { personagem } = await criarPersonagem({ nivel: 30 });
  const evento = await criarEventoAtivo();

  const power = await Power.create({
    nome: `Poder Atordoante ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 10,
    escala_atributo: "Forca",
    valor_escala: 0,
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });
  const efeito = await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "STUN",
    chance_ppm: 1_000_000, // sempre proc-a — só a resistência do Boss decide se entra.
    duration_turns: 2,
    potency_base: 0,
    target: "Enemy",
  });

  await worldBossCombatService.entrar(personagem.id);
  await usarPoderAteAcertar(personagem.id, power.id);

  await evento.reload();
  assert.ok(
    evento.runtime_state?.status_boss?.some((s) => s.key === "STUN"),
    "Boss sem nenhuma resistência cadastrada pra STUN precisa receber o status normalmente",
  );

  await PowerStatusEffect.destroy({ where: { id: efeito.id } });
  await CharacterAbilities.destroy({ where: { id_power: power.id } });
  await power.destroy();
});

testeComBanco("combate: WorldBossStatusResistance imune impede o status de entrar no Boss, mesmo com proc garantido", async () => {
  const CharacterAbilities = require("../src/models/CharacterAbilities");
  const PowerStatusEffect = require("../src/models/PowerStatusEffect");

  const { personagem } = await criarPersonagem({ nivel: 30 });
  const evento = await criarEventoAtivo();
  evento.config_snapshot = { ...evento.config_snapshot, status_resistances: [{ status_key: "STUN", imune: true, resistencia_pct: 0 }] };
  await evento.save();

  const power = await Power.create({
    nome: `Poder Atordoante ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 10,
    escala_atributo: "Forca",
    valor_escala: 0,
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });
  const efeito = await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "STUN",
    chance_ppm: 1_000_000,
    duration_turns: 2,
    potency_base: 0,
    target: "Enemy",
  });

  await worldBossCombatService.entrar(personagem.id);
  await usarPoderAteAcertar(personagem.id, power.id);

  await evento.reload();
  assert.ok(
    !evento.runtime_state?.status_boss?.some((s) => s.key === "STUN"),
    "WorldBossStatusResistance.imune precisa impedir o status de entrar, mesmo com chance_ppm=100%",
  );

  await PowerStatusEffect.destroy({ where: { id: efeito.id } });
  await CharacterAbilities.destroy({ where: { id_power: power.id } });
  await power.destroy();
});

testeComBanco("combate: jogador atordoado (status próprio) não consegue agir — ação bloqueada, sem dano, sem gastar Mana", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  await criarEventoAtivo();
  await worldBossCombatService.entrar(personagem.id);

  const sessao = await WorldBossCombatSession.findOne({ where: { character_id: personagem.id, status: COMBAT_SESSION_STATUS.ATIVO } });
  sessao.state = { status: [{ key: "STUN", sourceActorId: "BOSS", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 1, potency: 0, appliedAtTurn: 0 }] };
  await sessao.save();

  const resultado = await worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" });
  assert.equal(resultado.bloqueado, true);
  assert.equal(resultado.motivoBloqueio, "STUN");
  assert.equal(resultado.dano, 0);

  await sessao.reload();
  assert.equal(sessao.action_seq, 0, "ação bloqueada nunca conta como uma ação de combate de verdade (action_seq intocado)");
  assert.equal(sessao.state.status[0].remainingTurns, 1, "o turno bloqueado AINDA decrementa a duração — senão o Stun nunca acaba");
});

testeComBanco("combate: veneno no próprio jogador pode matá-lo ANTES de agir — sessão vira DERROTADO, nunca ataca", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  personagem.vida_atual = 1;
  await personagem.save();
  const evento = await criarEventoAtivo();
  const hpAntesDoEvento = Number(evento.hp_current);
  await worldBossCombatService.entrar(personagem.id);

  const sessao = await WorldBossCombatSession.findOne({ where: { character_id: personagem.id, status: COMBAT_SESSION_STATUS.ATIVO } });
  sessao.state = { status: [{ key: "POISON", sourceActorId: "BOSS", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 3, potency: 999, appliedAtTurn: 0 }] };
  await sessao.save();

  const resultado = await worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" });
  assert.equal(resultado.morreuAntesDeAgir, true);
  assert.equal(resultado.dano, 0, "morreu pro próprio veneno, nunca chegou a golpear o Boss");

  await personagem.reload();
  assert.equal(personagem.vida_atual, 0);

  await sessao.reload();
  assert.equal(sessao.status, COMBAT_SESSION_STATUS.DERROTADO);

  await evento.reload();
  assert.equal(Number(evento.hp_current), hpAntesDoEvento, "o Boss nunca pode perder HP de um jogador que morreu antes de agir");
});

testeComBanco("runtime: DoT no próprio Boss chipa HP a cada ação dele, mas nunca chega a zero por conta própria", async () => {
  const evento = await criarEventoAtivoV2({ hpCurrent: 5, hpMax: 1000 });
  await evento.update({ runtime_state: { status_boss: [{ key: "POISON", sourceActorId: "1", sourcePowerId: null, sourceItemId: null, remainingTurns: 5, stacks: 3, potency: 999, appliedAtTurn: 0 }] } });

  await worldBossRuntimeService.processarProximaAcao();

  await evento.reload();
  assert.equal(Number(evento.hp_current), 1, "DoT nunca entrega o Golpe Final por conta própria — sempre clampado em 1");
});

testeComBanco("runtime: Boss atordoado perde a ação inteira (nem habilidade, nem ataque básico), mas o Stun expira normalmente", async () => {
  const habilidade = habilidadeSnapshot({ idAbility: 1, custoMana: 0 });
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidade] } });
  await evento.update({ runtime_state: { status_boss: [{ key: "STUN", sourceActorId: "1", sourcePowerId: null, sourceItemId: null, remainingTurns: 1, stacks: 1, potency: 0, appliedAtTurn: 0 }] } });
  const { personagem } = await criarPersonagem();
  await worldBossCombatService.entrar(personagem.id);

  const resultado = await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());
  assert.equal(resultado.boss_bloqueado, "STUN");
  assert.equal(resultado.alvo, undefined);
  assert.equal(resultado.habilidade, undefined);

  await evento.reload();
  assert.equal(evento.runtime_state.status_boss.length, 0, "duração 1 decrementa pra 0 e expira mesmo no turno em que bloqueou a ação");
  assert.equal(evento.boss_action_seq, 1, "o turno bloqueado ainda avança o relógio — senão o Boss travaria pra sempre preso no Stun");
});

testeComBanco("runtime: habilidade do Boss com PowerStatusEffect (Enemy) aplica status no jogador atingido", async () => {
  const CharacterAbilities = require("../src/models/CharacterAbilities");
  const PowerStatusEffect = require("../src/models/PowerStatusEffect");

  const power = await Power.create({
    nome: `Veneno do Boss ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 5,
    escala_atributo: "Forca",
    valor_escala: 0,
  });
  const efeito = await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "POISON",
    chance_ppm: 1_000_000,
    duration_turns: 3,
    potency_base: 5,
    target: "Enemy",
  });

  const habilidade = habilidadeSnapshot({ idAbility: 1, custoMana: 0 });
  habilidade.power_snapshot.id = power.id; // resolverEfeitosDoUso lê PowerStatusEffect por id_power de verdade.
  const evento = await criarEventoAtivoV2({ snapshotOverrides: { manaMaxima: 100, abilities: [habilidade] } });
  const { personagem } = await criarPersonagem();
  personagem.vida_atual = 9999;
  await personagem.save();
  await worldBossCombatService.entrar(personagem.id);

  await comMathRandomFixo(0.99, () => worldBossRuntimeService.processarProximaAcao());

  const sessao = await WorldBossCombatSession.findOne({ where: { character_id: personagem.id, status: COMBAT_SESSION_STATUS.ATIVO } });
  assert.ok(sessao.state?.status?.some((s) => s.key === "POISON"), "habilidade do Boss com PowerStatusEffect Enemy precisa aplicar o status no jogador atingido");

  await PowerStatusEffect.destroy({ where: { id: efeito.id } });
  await power.destroy();
});

// Ameaça Mundial V2 — Etapa 7: Morte/reentrada (§8.2/§8.3).

testeComBanco("combate: sem reentrada_permitida (default), jogador derrotado nunca pode entrar de novo no mesmo evento", async () => {
  const { personagem } = await criarPersonagem();
  const evento = await criarEventoAtivo();
  await WorldBossCombatSession.create({
    event_id: evento.id,
    character_id: personagem.id,
    status: COMBAT_SESSION_STATUS.DERROTADO,
    action_seq: 3,
    derrotado_at: new Date(),
    state: {},
  });

  await assert.rejects(() => worldBossCombatService.entrar(personagem.id), /não pode reentrar/);
});

testeComBanco("combate: reentrada_permitida=true mas cooldown ainda não passou é rejeitada com o tempo restante", async () => {
  const { personagem } = await criarPersonagem();
  const evento = await criarEventoAtivo();
  evento.config_snapshot = { ...evento.config_snapshot, reentrada_permitida: true, cooldown_reentrada_segundos: 60 };
  await evento.save();
  await WorldBossCombatSession.create({
    event_id: evento.id,
    character_id: personagem.id,
    status: COMBAT_SESSION_STATUS.DERROTADO,
    action_seq: 3,
    derrotado_at: new Date(),
    state: {},
  });

  await assert.rejects(() => worldBossCombatService.entrar(personagem.id), /poderá reentrar em/);
});

testeComBanco("combate: cooldown de reentrada já passado, mas HP ainda zerado, continua rejeitado até recuperar vida", async () => {
  const { personagem } = await criarPersonagem();
  personagem.vida_atual = 0;
  await personagem.save();
  const evento = await criarEventoAtivo();
  evento.config_snapshot = { ...evento.config_snapshot, reentrada_permitida: true, cooldown_reentrada_segundos: 1 };
  await evento.save();
  await WorldBossCombatSession.create({
    event_id: evento.id,
    character_id: personagem.id,
    status: COMBAT_SESSION_STATUS.DERROTADO,
    action_seq: 3,
    derrotado_at: new Date(Date.now() - 60_000),
    state: {},
  });

  await assert.rejects(() => worldBossCombatService.entrar(personagem.id), /Recupere sua vida/);
});

testeComBanco("combate: reentrada com cooldown passado e vida recuperada cria uma sessão Ativa NOVA (nunca cura sozinha)", async () => {
  const { personagem } = await criarPersonagem();
  const vidaAntesDeReentrar = personagem.vida_atual;
  const evento = await criarEventoAtivo();
  evento.config_snapshot = { ...evento.config_snapshot, reentrada_permitida: true, cooldown_reentrada_segundos: 1 };
  await evento.save();
  const sessaoAntiga = await WorldBossCombatSession.create({
    event_id: evento.id,
    character_id: personagem.id,
    status: COMBAT_SESSION_STATUS.DERROTADO,
    action_seq: 3,
    derrotado_at: new Date(Date.now() - 60_000),
    state: {},
  });

  const resultado = await worldBossCombatService.entrar(personagem.id);
  assert.notEqual(resultado.sessao.id, sessaoAntiga.id, "reentrada precisa criar uma sessão NOVA, nunca reabrir a DERROTADO");

  const novaSessao = await WorldBossCombatSession.findOne({
    where: { event_id: evento.id, character_id: personagem.id, status: COMBAT_SESSION_STATUS.ATIVO },
  });
  assert.ok(novaSessao);

  await personagem.reload();
  assert.equal(personagem.vida_atual, vidaAntesDeReentrar, "reentrar nunca cura silenciosamente (§8.3)");
});

// Ameaça Mundial V2 — Etapa 8: Ranking/finalização (§10).

testeComBanco("ranking: Top N ordenado por dano, desempate por last_damage_at (mais antigo primeiro) e depois character_id", async () => {
  const evento = await criarEventoAtivo();
  const { personagem: maiorDano } = await criarPersonagem();
  const { personagem: empateAntigo } = await criarPersonagem();
  const { personagem: empateRecente } = await criarPersonagem();

  await WorldBossContribution.create({ event_id: evento.id, character_id: maiorDano.id, damage_total: 1000, last_damage_at: new Date() });
  await WorldBossContribution.create({
    event_id: evento.id,
    character_id: empateAntigo.id,
    damage_total: 500,
    last_damage_at: new Date(Date.now() - 60_000),
  });
  await WorldBossContribution.create({ event_id: evento.id, character_id: empateRecente.id, damage_total: 500, last_damage_at: new Date() });

  const ranking = await worldBossRankingService.obterRanking({ eventId: evento.id, limit: 10 });
  assert.equal(ranking.top.length, 3);
  assert.equal(ranking.top[0].character_id, maiorDano.id);
  assert.equal(ranking.top[1].character_id, empateAntigo.id, "empate em dano: quem chegou lá PRIMEIRO (last_damage_at mais antigo) vence");
  assert.equal(ranking.top[2].character_id, empateRecente.id);
  assert.equal(ranking.top[0].posicao, 1);
  assert.ok(ranking.top[0].damage_percent > 0);
});

testeComBanco("ranking: minha_posicao aparece mesmo fora do Top N — nunca esconde a posição do próprio jogador", async () => {
  const evento = await criarEventoAtivo({ hpMax: 10000 });
  const { personagem: foraDoTop } = await criarPersonagem();
  await WorldBossContribution.create({ event_id: evento.id, character_id: foraDoTop.id, damage_total: 1, last_damage_at: new Date() });

  for (let i = 0; i < 3; i++) {
    const { personagem } = await criarPersonagem();
    await WorldBossContribution.create({ event_id: evento.id, character_id: personagem.id, damage_total: 1000 - i, last_damage_at: new Date() });
  }

  const ranking = await worldBossRankingService.obterRanking({ eventId: evento.id, limit: 2, characterId: foraDoTop.id });
  assert.equal(ranking.top.length, 2);
  assert.ok(!ranking.top.some((linha) => linha.character_id === foraDoTop.id));
  assert.ok(ranking.minha_posicao, "jogador fora do Top N precisa continuar aparecendo em minha_posicao");
  assert.equal(ranking.minha_posicao.character_id, foraDoTop.id);
  assert.equal(ranking.minha_posicao.posicao, 4, "4º colocado entre 4 participantes (3 com mais dano + ele)");
});

testeComBanco("ranking: badges GOLPE_FINAL/DESCOBRIDOR aparecem sempre; MAIOR_DANO só depois de DEFEATED (top_damage_character_id)", async () => {
  const evento = await criarEventoAtivo();
  const { personagem } = await criarPersonagem();
  await WorldBossContribution.create({ event_id: evento.id, character_id: personagem.id, damage_total: 100, last_damage_at: new Date() });
  evento.final_blow_character_id = personagem.id;
  evento.discoverer_character_id = personagem.id;
  await evento.save();

  const rankingAtivo = await worldBossRankingService.obterRanking({ eventId: evento.id });
  assert.equal(rankingAtivo.lider_oficial, false, "evento ACTIVE nunca tem líder OFICIAL ainda — só 'líder de dano' (decidido pelo front)");
  assert.deepEqual(new Set(rankingAtivo.top[0].badges), new Set(["GOLPE_FINAL", "DESCOBRIDOR"]));
  assert.ok(!rankingAtivo.top[0].badges.includes("MAIOR_DANO"), "MAIOR_DANO nunca aparece antes do evento concluir");

  evento.status = EVENT_STATUS.DEFEATED;
  evento.top_damage_character_id = personagem.id;
  evento.top_damage_total = 100;
  await evento.save();

  const rankingFinal = await worldBossRankingService.obterRanking({ eventId: evento.id });
  assert.equal(rankingFinal.lider_oficial, true);
  assert.ok(rankingFinal.top[0].badges.includes("MAIOR_DANO"));
});

testeComBanco("combate: Golpe Final congela top_damage_character_id pelo MAIOR dano acumulado, não por quem deu o golpe final", async () => {
  const { personagem: maiorDano } = await criarPersonagem({ nivel: 30 });
  const { personagem: golpeFinalPor } = await criarPersonagem({ nivel: 50 });
  // criarPersonagem não aceita override de força — ajusta direto, igual
  // ao padrão já usado noutros testes deste arquivo (personagem.defesa
  // = 0; await personagem.save()), pra garantir overkill de um hit só.
  golpeFinalPor.forca = 999;
  await golpeFinalPor.save();

  // HP baixo o bastante pra golpeFinalPor (forte) zerar de um hit só,
  // mas maiorDano já acumulou mais dano total ANTES disso.
  const evento = await criarEventoAtivo({ hpCurrent: 200, hpMax: 100000, defesa: 0 });
  await worldBossCombatService.entrar(maiorDano.id);
  await worldBossCombatService.entrar(golpeFinalPor.id);

  await atacarAteAcertar(maiorDano.id); // acumula dano real primeiro (evento.hp_current cai, mas segue > 0).
  await evento.reload();
  assert.ok(Number(evento.hp_current) > 0, "cenário precisa do evento ainda vivo depois do primeiro ataque");

  const contribuicaoMaiorDanoAntes = await WorldBossContribution.findOne({ where: { event_id: evento.id, character_id: maiorDano.id } });
  // Garante um dano acumulado bem maior que o golpe final que vem a
  // seguir, isolando a variável do teste (não depender de sorte de RNG).
  await contribuicaoMaiorDanoAntes.update({ damage_total: Number(evento.hp_current) + 999999, last_damage_at: new Date(Date.now() - 5000) });

  const golpeFinal = await atacarAteAcertar(golpeFinalPor.id);
  assert.equal(golpeFinal.golpeFinal, true);

  await evento.reload();
  assert.equal(evento.final_blow_character_id, golpeFinalPor.id, "final_blow é sempre de quem literalmente zerou o HP");
  assert.equal(evento.top_damage_character_id, maiorDano.id, "top_damage é de quem acumulou MAIS dano total, não de quem deu o golpe final");
});

testeComBanco("combate: last_damage_at só avança em dano EFETIVO — uma esquiva nunca conta pro desempate do ranking", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  personagem.agilidade = 0;
  await personagem.save();
  await criarEventoAtivo();
  await worldBossCombatService.entrar(personagem.id);

  // Math.random()=0 força esquiva (chanceDeEsquiva nunca é menor que o
  // piso de 5%) — dano zero, ação registrada, mas sem golpe de verdade.
  const resultadoEsquivado = await comMathRandomFixo(0, () => worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" }));
  assert.equal(resultadoEsquivado.esquivou, true);
  assert.equal(resultadoEsquivado.dano, 0);

  const contribuicao = await WorldBossContribution.findOne({ where: { character_id: personagem.id } });
  assert.equal(contribuicao.last_action_at !== null, true);
  assert.equal(contribuicao.last_damage_at, null, "esquiva (dano 0) nunca pode adiantar last_damage_at");
});

// Ameaça Mundial V2 — Etapa 9: Recompensas — TOP_DAMAGE (§11).

testeComBanco("recompensas: TOP_DAMAGE concede a faixa de 1º lugar pro vencedor do ranking congelado, idempotente em chamadas repetidas", async () => {
  const config = await criarConfig();
  const itemDoPremio = await criarItemGolpeFinal();
  await WorldBossRankingReward.create({
    id_world_boss_config: config.id,
    posicao_inicio: 1,
    posicao_fim: 1,
    id_item: itemDoPremio.id,
    quantidade: 2,
    gold: 300,
    xp: 150,
  });

  const { personagem: vencedor } = await criarPersonagem();
  const dinheiroAntes = vencedor.dinheiro;
  const evento = await criarEvento({
    config,
    status: EVENT_STATUS.DEFEATED,
    overrides: {
      top_damage_character_id: vencedor.id,
      defeated_at: new Date(),
      participation_rewards_status: PARTICIPATION_REWARDS_STATUS.PENDING,
    },
  });

  await worldBossRewardService.processarRecompensas(evento.id);
  await worldBossRewardService.processarRecompensas(evento.id); // repetição — nunca pode dobrar.

  await vencedor.reload();
  assert.equal(vencedor.dinheiro, dinheiroAntes + 300, "gold da faixa de 1º lugar precisa ser concedido exatamente uma vez");

  const posse = await CharacterInventory.findOne({ where: { id_personagem: vencedor.id, id_item: itemDoPremio.id } });
  assert.equal(posse.quantidade, 2, "quantidade da faixa, nunca dobrada por reprocessar");

  const grant = await WorldBossRewardGrant.findOne({
    where: { event_id: evento.id, character_id: vencedor.id, reward_kind: REWARD_KIND.TOP_DAMAGE },
  });
  assert.equal(grant.status, "Granted");
});

testeComBanco("recompensas: sem top_damage_character_id (nenhum dano real registrado), TOP_DAMAGE nunca é concedido a ninguém", async () => {
  const config = await criarConfig();
  const itemDoPremio = await criarItemGolpeFinal();
  await WorldBossRankingReward.create({
    id_world_boss_config: config.id,
    posicao_inicio: 1,
    posicao_fim: 1,
    id_item: itemDoPremio.id,
    quantidade: 1,
    gold: 100,
  });

  const evento = await criarEvento({
    config,
    status: EVENT_STATUS.DEFEATED,
    overrides: { defeated_at: new Date(), participation_rewards_status: PARTICIPATION_REWARDS_STATUS.PENDING },
  });

  await worldBossRewardService.processarRecompensas(evento.id);

  const grants = await WorldBossRewardGrant.count({ where: { event_id: evento.id, reward_kind: REWARD_KIND.TOP_DAMAGE } });
  assert.equal(grants, 0, "sem vencedor oficial (top_damage_character_id nulo), nenhum grant TOP_DAMAGE pode existir");
});

// Ameaça Mundial V2 — Etapa 10: Status público + Guilda (§12).

testeComBanco("status público: inclui zona_descoberta (§12.1) quando o evento tem discovery_zone_id", async () => {
  const zona = await criarZona();
  const { personagem: descobridor } = await criarPersonagem();

  const evento = await criarEventoAtivo();
  evento.status = EVENT_STATUS.DISCOVERED;
  evento.discoverer_character_id = descobridor.id;
  evento.discovery_zone_id = zona.id;
  evento.discovered_at = new Date();
  await evento.save();

  const status = await worldBossStatusService.obterStatusPublico();
  assert.equal(status.event_id, evento.id);
  assert.equal(status.zona_descoberta.id, zona.id);
  assert.equal(status.zona_descoberta.nome, zona.nome);
  assert.equal(status.descobridor.id, descobridor.id);
});

testeComBanco("status público: maior_dano_por só aparece depois de DEFEATED — enquanto ACTIVE fica null mesmo com dano registrado", async () => {
  const { personagem } = await criarPersonagem();
  const evento = await criarEventoAtivo();
  await WorldBossContribution.create({ event_id: evento.id, character_id: personagem.id, damage_total: 500, last_damage_at: new Date() });

  const statusAtivo = await worldBossStatusService.obterStatusPublico();
  assert.equal(statusAtivo.maior_dano_por, null, "top_damage_character_id só existe congelado no Golpe Final — nunca antes");

  evento.status = EVENT_STATUS.DEFEATED;
  evento.top_damage_character_id = personagem.id;
  evento.top_damage_total = 500;
  evento.defeated_at = new Date();
  await evento.save();

  const statusDerrotado = await worldBossStatusService.obterStatusPublico();
  assert.equal(statusDerrotado.maior_dano_por.id, personagem.id);
  assert.equal(statusDerrotado.maior_dano_por.damage_total, 500);
});

testeComBanco("histórico: obterHistoricoRecente lista só eventos DEFEATED, mais recentes primeiro, nunca CANCELLED", async () => {
  const configA = await criarConfig();
  const { personagem: golpeFinalPor } = await criarPersonagem();
  const eventoAntigo = await criarEvento({
    config: configA,
    status: EVENT_STATUS.DEFEATED,
    overrides: { final_blow_character_id: golpeFinalPor.id, defeated_at: new Date(Date.now() - 60_000) },
  });
  const eventoRecente = await criarEvento({
    config: configA,
    status: EVENT_STATUS.DEFEATED,
    overrides: { final_blow_character_id: golpeFinalPor.id, defeated_at: new Date() },
  });
  const eventoCancelado = await criarEvento({ config: configA, status: EVENT_STATUS.CANCELLED, overrides: { defeated_at: null } });
  void eventoCancelado;

  const historico = await worldBossStatusService.obterHistoricoRecente({ limit: 10 });
  const idsNoHistorico = historico.map((h) => h.event_id);
  assert.ok(idsNoHistorico.includes(eventoRecente.id));
  assert.ok(idsNoHistorico.includes(eventoAntigo.id));
  assert.ok(!idsNoHistorico.includes(eventoCancelado.id), "CANCELLED nunca aparece no histórico — não é uma 'aparição' de verdade");
  assert.ok(idsNoHistorico.indexOf(eventoRecente.id) < idsNoHistorico.indexOf(eventoAntigo.id), "mais recente primeiro");

  const linhaRecente = historico.find((h) => h.event_id === eventoRecente.id);
  assert.equal(linhaRecente.golpe_final_por.id, golpeFinalPor.id);
});

// Ameaça Mundial V2 — Etapa 11: Admin V2, backend (§13).

testeComBanco("admin habilidades: CRUD completo — cria, lista com Power incluído, edita e exclui", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  const power = await Power.create({
    nome: `Poder Admin Teste ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    dano_base: 50,
    custo_mana: 20,
    cooldown: 3,
  });
  powersCriados.push(power.id);

  const habilidade = await adminWorldBossService.createAdminWorldBossAbility(
    criado.id,
    { id_power: power.id, peso_uso: 5, prioridade: 2, tipo_alvo: "N_ALEATORIOS", quantidade_alvos: 3 },
    { idAdmin: usuario.id },
  );
  assert.equal(habilidade.id_world_boss_config, criado.id);
  assert.equal(habilidade.tipo_alvo, "N_ALEATORIOS");

  const listadas = await adminWorldBossService.listAdminWorldBossAbilities(criado.id);
  assert.equal(listadas.length, 1);
  assert.equal(listadas[0].Power.id, power.id, "listagem precisa vir com o Power incluído (§13.5)");

  const editada = await adminWorldBossService.updateAdminWorldBossAbility(criado.id, habilidade.id, { peso_uso: 9, ativo: false }, { idAdmin: usuario.id });
  assert.equal(editada.peso_uso, 9);
  assert.equal(editada.ativo, false);

  await adminWorldBossService.deleteAdminWorldBossAbility(criado.id, habilidade.id, { idAdmin: usuario.id });
  const depoisDeExcluir = await adminWorldBossService.listAdminWorldBossAbilities(criado.id);
  assert.equal(depoisDeExcluir.length, 0);
});

testeComBanco("admin habilidades: N_ALEATORIOS sem quantidade_alvos é rejeitado; id_power inexistente é rejeitado", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  const power = await Power.create({ nome: `Poder ${sufixo()}`, descricao: "x", tipo_poder: "Ativo", escala_atributo: "Forca", dano_base: 10, custo_mana: 5 });
  powersCriados.push(power.id);

  await assert.rejects(
    () => adminWorldBossService.createAdminWorldBossAbility(criado.id, { id_power: power.id, tipo_alvo: "N_ALEATORIOS" }, { idAdmin: usuario.id }),
    /quantidade_alvos/,
  );
  await assert.rejects(
    () => adminWorldBossService.createAdminWorldBossAbility(criado.id, { id_power: 999999999 }, { idAdmin: usuario.id }),
    /id_power não aponta/,
  );
});

testeComBanco("admin resistências: CRUD completo e impede status_key duplicado no mesmo catálogo", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);

  const resistencia = await adminWorldBossService.createAdminWorldBossResistance(criado.id, { status_key: "STUN", imune: true }, { idAdmin: usuario.id });
  assert.equal(resistencia.status_key, "STUN");
  assert.equal(resistencia.imune, true);

  await assert.rejects(
    () => adminWorldBossService.createAdminWorldBossResistance(criado.id, { status_key: "STUN", resistencia_pct: 50 }, { idAdmin: usuario.id }),
    /Já existe uma resistência/,
  );

  await assert.rejects(
    () => adminWorldBossService.createAdminWorldBossResistance(criado.id, { status_key: "NAO_EXISTE" }, { idAdmin: usuario.id }),
    /status_key precisa ser um de/,
  );

  const editada = await adminWorldBossService.updateAdminWorldBossResistance(criado.id, resistencia.id, { imune: false, resistencia_pct: 75 }, { idAdmin: usuario.id });
  assert.equal(editada.imune, false);
  assert.equal(editada.resistencia_pct, 75);

  await adminWorldBossService.deleteAdminWorldBossResistance(criado.id, resistencia.id, { idAdmin: usuario.id });
  const listadas = await adminWorldBossService.listAdminWorldBossResistances(criado.id);
  assert.equal(listadas.length, 0);
});

testeComBanco("admin recompensas de ranking: CRUD completo, valida posicao_fim >= posicao_inicio e id_item existente", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const criado = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(criado.id);
  const item = await criarItemGolpeFinal();

  const faixa = await adminWorldBossService.createAdminWorldBossRankingReward(
    criado.id,
    { posicao_inicio: 1, posicao_fim: 1, id_item: item.id, quantidade: 1, gold: 500, xp: 200 },
    { idAdmin: usuario.id },
  );
  assert.equal(faixa.gold, 500);

  await assert.rejects(
    () => adminWorldBossService.createAdminWorldBossRankingReward(criado.id, { posicao_inicio: 3, posicao_fim: 2 }, { idAdmin: usuario.id }),
    /posicao_fim precisa ser/,
  );
  await assert.rejects(
    () => adminWorldBossService.createAdminWorldBossRankingReward(criado.id, { posicao_inicio: 2, posicao_fim: 3, id_item: 999999999 }, { idAdmin: usuario.id }),
    /id_item não aponta/,
  );

  const editada = await adminWorldBossService.updateAdminWorldBossRankingReward(criado.id, faixa.id, { gold: 700 }, { idAdmin: usuario.id });
  assert.equal(editada.gold, 700);

  await adminWorldBossService.deleteAdminWorldBossRankingReward(criado.id, faixa.id, { idAdmin: usuario.id });
  const listadas = await adminWorldBossService.listAdminWorldBossRankingRewards(criado.id);
  assert.equal(listadas.length, 0);
});

testeComBanco("admin catálogo: duplicateAdminWorldBossConfig também copia habilidades/resistências/recompensas de ranking", async () => {
  const { usuario } = await criarPersonagem();
  const { payload } = await payloadConfigAdmin();
  const original = await adminWorldBossService.createAdminWorldBossConfig(payload, { idAdmin: usuario.id });
  configsCriados.push(original.id);

  const power = await Power.create({ nome: `Poder ${sufixo()}`, descricao: "x", tipo_poder: "Ativo", escala_atributo: "Forca", dano_base: 10, custo_mana: 5 });
  powersCriados.push(power.id);
  await adminWorldBossService.createAdminWorldBossAbility(original.id, { id_power: power.id }, { idAdmin: usuario.id });
  await adminWorldBossService.createAdminWorldBossResistance(original.id, { status_key: "POISON", resistencia_pct: 30 }, { idAdmin: usuario.id });
  const item = await criarItemGolpeFinal();
  await adminWorldBossService.createAdminWorldBossRankingReward(original.id, { posicao_inicio: 1, posicao_fim: 1, id_item: item.id, gold: 100 }, { idAdmin: usuario.id });

  const copia = await adminWorldBossService.duplicateAdminWorldBossConfig(original.id, { idAdmin: usuario.id });
  configsCriados.push(copia.id);

  const habilidadesCopia = await adminWorldBossService.listAdminWorldBossAbilities(copia.id);
  const resistenciasCopia = await adminWorldBossService.listAdminWorldBossResistances(copia.id);
  const recompensasCopia = await adminWorldBossService.listAdminWorldBossRankingRewards(copia.id);
  assert.equal(habilidadesCopia.length, 1);
  assert.equal(resistenciasCopia.length, 1);
  assert.equal(resistenciasCopia[0].status_key, "POISON");
  assert.equal(recompensasCopia.length, 1);
});

testeComBanco("admin preview de dano: reaproveita furiaPctDe de verdade — dano cresce com a ação e respeita o limite de Fúria da fase", async () => {
  const { usuario } = await criarPersonagem();
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça Preview ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 100000,
    defesa: 0,
    mensagem_descoberta: "d",
    mensagem_convocacao: "c",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Fase 1",
    hp_percentual_max: 100,
    modificador_dano_percentual: 0,
    dano_min: 100,
    dano_max: 100,
    furia_por_acao_pct: 5,
    limite_furia_pct: 20,
  });
  void usuario;

  const preview = await adminWorldBossService.previewDanoAdminWorldBoss(config.id, { faseOrdem: 1, acoes: [1, 10, 50] });
  assert.equal(preview.estimativas.length, 3);

  const acao1 = preview.estimativas.find((e) => e.acao === 1);
  const acao10 = preview.estimativas.find((e) => e.acao === 10);
  const acao50 = preview.estimativas.find((e) => e.acao === 50);

  assert.equal(acao1.furia_pct, 5);
  assert.equal(acao1.dano_min, 105); // 100 * (1 + 5/100)
  assert.equal(acao10.furia_pct, 20, "Fúria precisa respeitar limite_furia_pct=20 já na ação 10 (5%/ação * 10 = 50%, capado em 20%)");
  assert.equal(acao50.furia_pct, 20, "continua capado em 20% muito depois do limite");
  assert.equal(acao10.dano_min, acao50.dano_min, "dano estimado empata quando a Fúria já está no limite — nunca continua crescendo depois do cap");
});

testeComBanco("admin preview de habilidade: reaproveita calcularEfeitoPoderEsperado com os atributos do Boss + furia/fase da fase escolhida — cura nunca escala", async () => {
  const { usuario } = await criarPersonagem();
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça Preview Habilidade ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 100000,
    defesa: 0,
    mensagem_descoberta: "d",
    mensagem_convocacao: "c",
    id_item_golpe_final: item.id,
    nivel: 1,
    forca: 100,
  });
  configsCriados.push(config.id);
  await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Fase 1",
    hp_percentual_max: 100,
    modificador_dano_percentual: 10,
    dano_min: 50,
    dano_max: 80,
    furia_por_acao_pct: 5,
    limite_furia_pct: 20,
  });
  const power = await Power.create({
    nome: `Poder Preview ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    dano_base: 10,
    cura_base: 30,
    valor_escala: 2,
    custo_mana: 15,
    cooldown: 4,
  });
  powersCriados.push(power.id);
  const habilidade = await adminWorldBossService.createAdminWorldBossAbility(config.id, { id_power: power.id }, { idAdmin: usuario.id });

  const preview = await adminWorldBossService.previewHabilidadeAdminWorldBoss(config.id, { idAbility: habilidade.id, faseOrdem: 1, acoes: [1, 10] });
  assert.equal(preview.power.custo_mana, 15);
  assert.equal(preview.habilidade.cooldown, 4, "sem cooldown_override, cai pro cooldown do Power");
  assert.equal(preview.habilidade.escala_com_furia, true, "default de createAdminWorldBossAbility");

  const acao1 = preview.estimativas.find((e) => e.acao === 1);
  const acao10 = preview.estimativas.find((e) => e.acao === 10);
  // Efeito bruto determinístico (nivel=1 -> bonusNivel=0, multClasse Fisico=1, multNivelHabilidade(1)=1):
  // dano = (dano_base=10 + forca=100 * valor_escala=2) = 210; cura = (cura_base=30 + 100*2) = 230.
  assert.equal(acao1.furia_pct, 5);
  assert.equal(acao1.dano, Math.round(210 * 1.1 * 1.05));
  assert.equal(acao10.furia_pct, 20, "capado em limite_furia_pct=20 da fase");
  assert.equal(acao10.dano, Math.round(210 * 1.1 * 1.2));
  assert.equal(acao1.cura, 230, "cura nunca escala com o modificador de dano da fase nem com Fúria (§5.5)");
  assert.equal(acao1.cura, acao10.cura, "cura idêntica em qualquer contagem de ação");
});

testeComBanco("admin ciclo atual: getStatusOperacional inclui runtime_v2 (mana/fase/ranking/participantes) só quando ACTIVE", async () => {
  const evento = await criarEventoAtivoV2({ hpCurrent: 800, hpMax: 1000 });
  const { personagem } = await criarPersonagem();
  await worldBossCombatService.entrar(personagem.id);

  const status = await adminWorldBossEventService.getStatusOperacional();
  assert.equal(status.id, evento.id);
  assert.ok(status.runtime_v2, "evento ACTIVE precisa vir com runtime_v2 preenchido");
  assert.equal(status.runtime_v2.participantes.ativos, 1);
  assert.equal(status.runtime_v2.participantes.derrotados, 0);
  assert.ok(Array.isArray(status.runtime_v2.ranking_ao_vivo));

  await evento.update({ status: EVENT_STATUS.DORMANT });
  const statusDormant = await adminWorldBossEventService.getStatusOperacional();
  assert.equal(statusDormant.runtime_v2, null, "fora de ACTIVE, runtime_v2 precisa ser null — não faz sentido monitor de combate pra quem não despertou");
});

// Ameaça Mundial V2 — Etapa 12 (§14.2): Simulador de balanceamento.
testeComBanco("simulador: dano leve contra HP alto — sobrevivência ~100% e dano médio por fase próximo do esperado", async () => {
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça Simulador Leve ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 100000,
    defesa: 0,
    mensagem_descoberta: "d",
    mensagem_convocacao: "c",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Fase 1",
    hp_percentual_max: 100,
    dano_min: 50,
    dano_max: 50,
    furia_por_acao_pct: 0,
  });

  const resultado = await worldBossBalanceSimulationService.simularBalanceamentoWorldBossAdmin(config.id, {
    personagem: { hp_maximo: 100000, defesa: 0, agilidade: 0 },
    acoes_por_fase: 100,
    quantidade_simulacoes: 50,
  });

  assert.equal(resultado.taxa_sobrevivencia_pct, 100, "100 ações de 50 de dano (5000 no máximo) nunca derruba 100000 de HP");
  assert.equal(resultado.acao_media_ate_derrotar, null, "ninguém morreu — não há média de ação até derrotar");
  assert.equal(resultado.furia_media_pct, 0);
  assert.equal(resultado.furia_maxima_pct, 0);
  assert.equal(resultado.dano_por_fase.length, 1);
  const fase1 = resultado.dano_por_fase[0];
  assert.equal(fase1.acoes_estimadas, 100);
  // ~95% de chance de acerto (agilidade 0 dos dois lados) * 50 de dano * 100 ações ~= 4750, com folga generosa pra RNG.
  assert.ok(fase1.dano_medio > 3800 && fase1.dano_medio < 5000, `dano médio esperado por volta de 4750, veio ${fase1.dano_medio}`);
  assert.equal(fase1.alcancada_em_pct, 100);
});

testeComBanco("simulador: dano letal contra HP baixo — sobrevivência baixa e fase mais letal identificada", async () => {
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça Simulador Letal ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 100000,
    defesa: 0,
    mensagem_descoberta: "d",
    mensagem_convocacao: "c",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Fase Única",
    hp_percentual_max: 100,
    dano_min: 500,
    dano_max: 500,
    furia_por_acao_pct: 0,
  });

  const resultado = await worldBossBalanceSimulationService.simularBalanceamentoWorldBossAdmin(config.id, {
    personagem: { hp_maximo: 100, defesa: 0, agilidade: 0 },
    acoes_por_fase: 10,
    quantidade_simulacoes: 100,
  });

  assert.ok(resultado.taxa_sobrevivencia_pct < 20, `perfil de 100 HP contra 500 de dano por ação quase nunca sobrevive, veio ${resultado.taxa_sobrevivencia_pct}%`);
  assert.ok(resultado.acao_media_ate_derrotar !== null && resultado.acao_media_ate_derrotar <= 3, "primeiro acerto já é fatal — morte esperada bem no início");
  assert.equal(resultado.fase_mais_letal, 1, "só existe uma fase, então ela é sempre a mais letal quando alguém morre");
});

testeComBanco("simulador: Fúria cresce e respeita o limite da fase; habilidade cadastrada aparece na frequência de Powers", async () => {
  const { usuario } = await criarPersonagem();
  const item = await criarItemGolpeFinal();
  const config = await WorldBossConfig.create({
    nome: `Ameaça Simulador Furia ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 100000,
    defesa: 0,
    forca: 50,
    mana_maxima: 1000,
    regeneracao_mana_por_acao: 1000,
    mensagem_descoberta: "d",
    mensagem_convocacao: "c",
    id_item_golpe_final: item.id,
  });
  configsCriados.push(config.id);
  await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Fase 1",
    hp_percentual_max: 100,
    dano_min: 10,
    dano_max: 10,
    furia_por_acao_pct: 10,
    limite_furia_pct: 30,
  });
  const power = await Power.create({
    nome: `Poder Simulador ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    dano_base: 5,
    custo_mana: 10,
    cooldown: 0,
  });
  powersCriados.push(power.id);
  await adminWorldBossService.createAdminWorldBossAbility(config.id, { id_power: power.id, peso_uso: 100, prioridade: 10 }, { idAdmin: usuario.id });

  const resultado = await worldBossBalanceSimulationService.simularBalanceamentoWorldBossAdmin(config.id, {
    personagem: { hp_maximo: 1000000, defesa: 0, agilidade: 0 },
    acoes_por_fase: 20,
    quantidade_simulacoes: 30,
  });

  assert.equal(resultado.furia_maxima_pct, 30, "com 10%/ação e 20 ações, a Fúria bate o limite de 30% bem antes do fim");
  assert.ok(resultado.furia_media_pct > 0 && resultado.furia_media_pct <= 30);
  assert.ok(resultado.frequencia_powers.length > 0, "habilidade de prioridade máxima e mana sempre disponível precisa aparecer na frequência");
  assert.equal(resultado.frequencia_powers[0].nome, power.nome);
});

// Ameaça Mundial V2 — Etapa 12 (§14.1): métricas pós-evento.
testeComBanco("admin métricas: evento DEFEATED expõe métricas pós-evento — Furia máxima, dano recebido, participantes, tempo por fase", async () => {
  const { personagem } = await criarPersonagem();
  const evento = await criarEventoAtivoV2({
    hpCurrent: 1,
    hpMax: 100000,
    snapshotOverrides: {
      fases: [
        { id: 1, ordem: 1, nome_fase: "Fase Única", hp_percentual_max: 100, modificador_dano_percentual: 0, dano_min: 1, dano_max: 1, furia_por_acao_pct: 10, limite_furia_pct: 50, intervalo_acao_ms: 3000, mana_ao_entrar: null, texto_alerta: null },
      ],
    },
  });
  await worldBossCombatService.entrar(personagem.id);

  await comMathRandomFixo(0.99, async () => {
    await worldBossRuntimeService.processarProximaAcao();
    await evento.reload();
    evento.next_action_at = new Date(0);
    await evento.save();
    await worldBossRuntimeService.processarProximaAcao();
  });

  await evento.reload();
  assert.equal(Number(evento.runtime_state.furia_maxima_pct), 20, "10%/ação * 2 ações executadas");
  assert.ok(Number(evento.runtime_state.dano_total_recebido_jogadores) > 0, "as 2 ações do Boss acertaram o único participante");
  assert.ok(evento.runtime_state.fase_timestamps["1"], "entrada na Fase Única precisa ter sido carimbada");
  // Ligeiramente no passado, pra duracao_segundos nunca zerar por
  // colidir no mesmo segundo do defeated_at que vem a seguir.
  evento.activated_at = new Date(Date.now() - 5000);
  await evento.save();

  const golpe = await atacarAteAcertar(personagem.id);
  assert.equal(golpe.golpeFinal, true, "boss com 1 de HP morre no primeiro acerto");
  await evento.reload();
  assert.equal(evento.status, EVENT_STATUS.DEFEATED);

  const metricas = await adminWorldBossService.getAdminWorldBossMetrics();
  const linha = metricas.historico.find((h) => h.id === evento.id);
  assert.ok(linha, "evento recém-derrotado precisa aparecer no histórico");
  assert.ok(linha.metricas, "todo evento DEFEATED sempre vem com métricas calculadas");
  assert.equal(linha.metricas.participantes, 1);
  assert.equal(linha.metricas.derrotados, 0);
  assert.equal(linha.metricas.taxa_sobrevivencia_pct, 100);
  assert.equal(linha.metricas.furia_maxima_pct, 20);
  assert.ok(linha.metricas.dano_medio_recebido_por_jogador > 0);
  assert.equal(linha.metricas.habilidade_mais_derrotas, null, "ninguém foi derrotado durante o combate");
  assert.equal(linha.metricas.tempo_por_fase.length, 1);
  assert.equal(linha.metricas.tempo_por_fase[0].ordem, 1);
  assert.ok(Number.isInteger(linha.metricas.duracao_segundos) && linha.metricas.duracao_segundos > 0);
  assert.ok(linha.metricas.dps_agregado_jogadores === null || linha.metricas.dps_agregado_jogadores >= 0);
});
