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
const worldBossDiscoveryService = require("../src/services/worldBossDiscoveryService");
const worldBossLifecycleService = require("../src/services/worldBossLifecycleService");
const worldBossStatusService = require("../src/services/worldBossStatusService");
const worldBossScheduler = require("../src/services/worldBossScheduler");
const worldBossCombatService = require("../src/services/worldBossCombatService");
const { EVENT_STATUS, COMBAT_SESSION_STATUS } = require("../src/config/worldBossConfig");

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
    await WorldBossCombatSession.destroy({ where: { event_id: eventosCriados } });
    await WorldBossContribution.destroy({ where: { event_id: eventosCriados } });
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
