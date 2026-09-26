// Sistema de Proezas Únicas §16 — integração real dos 8 triggers
// restantes (ADVENTURE_VICTORY já cobre uniqueFeatIntegration.test.js).
// MESMO padrão daquele arquivo: banco real, sem mock de
// uniqueFeatService/uniqueFeatTriggerRegistry — sempre a função de
// serviço/controller PRODUÇÃO que já chama uniqueFeatService.check() no
// próprio evento autoritativo, nunca uma reimplementação da avaliação
// aqui no teste. Onde o sorteio é intrinsecamente aleatório
// (Expedição), crypto.randomInt é interceptado só pra tornar o SORTEIO
// determinístico — a chamada a uniqueFeatService.check() em si nunca é
// mockada.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Power = require("../src/models/Power");
const UniqueFeat = require("../src/models/UniqueFeat");
const UniqueFeatClaim = require("../src/models/UniqueFeatClaim");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const AdventureZone = require("../src/models/AdventureZone");

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

// --- fixture genérica de Proeza -----------------------------------------
async function criarProeza(triggerKey, triggerConfig) {
  const power = await Power.create({
    nome: `Legado de teste ${sufixo()}`,
    descricao: "Power de teste pra Proeza Única (integração real).",
    tipo_poder: "Ativo",
    custo_mana: 10,
    escala_atributo: "Forca",
    valor_escala: 1,
    acquisition_scope: "UNIQUE_FEAT",
  });
  const feat = await UniqueFeat.create({
    key: `teste_${sufixo()}`,
    nome: "Proeza de teste (integração real)",
    descricao_publica: "Lore pública de teste.",
    descricao_secreta_admin: "Condição secreta de teste.",
    trigger_key: triggerKey,
    trigger_config: triggerConfig,
    id_power_reward: power.id,
    ativa: true,
  });
  return { feat, power };
}

async function assertClaimado(feat, characterId) {
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.ok(claim, `claim devia ter sido criado pra Proeza "${feat.key}"`);
  assert.equal(claim.id_personagem, characterId);
  assert.equal(claim.trigger_key, feat.trigger_key);

  const ability = await CharacterAbilities.findOne({
    where: { id_personagem: characterId, id_power: feat.id_power_reward },
  });
  assert.ok(ability, "CharacterAbilities do Legado devia ter sido concedido");
  assert.equal(ability.is_active, false);
  assert.equal(ability.nivel_habilidade, 1);
  return claim;
}

async function assertNaoClaimado(feat) {
  const claim = await UniqueFeatClaim.findOne({ where: { id_unique_feat: feat.id } });
  assert.equal(claim, null, `Proeza "${feat.key}" não devia ter sido conquistada`);
}

function reqRes(characterId, body) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };
  return { req, res, resultado: () => ({ statusCode, corpo }) };
}

// =========================================================================
// 1. WORLD_BOSS_FINAL_BLOW — worldBossCombatService.executarAcao
// =========================================================================
const WorldBossConfig = require("../src/models/WorldBossConfig");
const WorldBossEvent = require("../src/models/WorldBossEvent");
const WorldBossCombatSession = require("../src/models/WorldBossCombatSession");
const WorldBossContribution = require("../src/models/WorldBossContribution");
const worldBossCombatService = require("../src/services/worldBossCombatService");
const { EVENT_STATUS, COMBAT_SESSION_STATUS } = require("../src/config/worldBossConfig");

const itensBossCriados = [];
const configsBossCriados = [];
const eventosBossCriados = [];

async function criarEventoAtivoComHpBaixo() {
  const item = await Item.create({
    nome: `Item Golpe Final Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Espolio",
    raridade: "Lendario",
    valor_compra: 0,
    valor_venda: 1,
  });
  itensBossCriados.push(item.id);

  const config = await WorldBossConfig.create({
    nome: `Ameaça de teste ${sufixo()}`,
    descricao: "teste",
    ativo: true,
    peso_selecao: 1,
    vida_base: 1,
    defesa: 0,
    mensagem_descoberta: "O chão treme...",
    mensagem_convocacao: "Ela desperta!",
    id_item_golpe_final: item.id,
  });
  configsBossCriados.push(config.id);

  const evento = await WorldBossEvent.create({
    id_world_boss_config: config.id,
    status: EVENT_STATUS.ACTIVE,
    hp_max: 1,
    hp_current: 1,
    config_snapshot: { nome: config.nome, defesa: 0, fases: [] },
    activated_at: new Date(),
  });
  eventosBossCriados.push(evento.id);
  return { config, evento };
}

testeComBanco("WORLD_BOSS_FINAL_BLOW: golpe final real concede a Proeza (claim + CharacterAbilities)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  const { config } = await criarEventoAtivoComHpBaixo();

  const { feat } = await criarProeza("WORLD_BOSS_FINAL_BLOW", { bossConfigId: config.id, finalBlow: true });

  await worldBossCombatService.entrar(personagem.id);

  // Vida do boss = 1 — o primeiro golpe que não for esquiva já é o
  // Golpe Final; a chance base de esquiva nunca é 100%, então tentar
  // algumas vezes é só pra não depender de sorte de esquiva (mesmo
  // padrão de test/worldBossDiscovery.test.js: atacarAteAcertar).
  let ultimo = null;
  for (let i = 0; i < 15 && !ultimo?.golpeFinal; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ultimo = await worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" });
  }

  assert.ok(ultimo.golpeFinal, "deveria ter derrotado o boss (hp_current=1) num dos ataques");
  assert.ok(ultimo.proezasConquistadas.some((p) => p.key === feat.key), "resposta devia listar a Proeza conquistada");

  await assertClaimado(feat, personagem.id);
});

testeComBanco("WORLD_BOSS_FINAL_BLOW: golpe final contra OUTRO bossConfigId não conquista nada", async () => {
  const { personagem } = await criarPersonagem({ nivel: 30 });
  await criarEventoAtivoComHpBaixo();

  const { feat } = await criarProeza("WORLD_BOSS_FINAL_BLOW", { bossConfigId: -999999, finalBlow: true });

  await worldBossCombatService.entrar(personagem.id);
  let ultimo = null;
  for (let i = 0; i < 15 && !ultimo?.golpeFinal; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    ultimo = await worldBossCombatService.executarAcao(personagem.id, { tipo: "attack" });
  }
  assert.ok(ultimo.golpeFinal);

  await assertNaoClaimado(feat);
});

test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosBossCriados.length > 0) {
    // worldBossCombatService.executarAcao dispara
    // worldBossRewardService.processarRecompensas "fire and forget" (de
    // propósito, ver comentário na produção) — dá um respiro pra essa
    // promise terminar ANTES de apagar o WorldBossEvent, senão ela
    // tenta gravar WorldBossRewardGrant contra uma linha que este
    // afterEach já apagou (FK, só ruído de log — nunca falha o teste,
    // mas é barulho evitável).
    await new Promise((r) => setTimeout(r, 200));
    const WorldBossRewardGrant = require("../src/models/WorldBossRewardGrant");
    await WorldBossRewardGrant.destroy({ where: { event_id: eventosBossCriados } });
    await WorldBossCombatSession.destroy({ where: { event_id: eventosBossCriados } });
    await WorldBossContribution.destroy({ where: { event_id: eventosBossCriados } });
    await WorldBossEvent.destroy({ where: { id: eventosBossCriados } });
    eventosBossCriados.length = 0;
  }
  if (configsBossCriados.length > 0) {
    await WorldBossConfig.destroy({ where: { id: configsBossCriados } });
    configsBossCriados.length = 0;
  }
});

// =========================================================================
// 2/3. FORGE_CRAFT_COMPLETED / FORGE_REFINEMENT_COMPLETED — forgeService.coletar
// =========================================================================
const CharacterForgeQueue = require("../src/models/CharacterForgeQueue");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const forgeService = require("../src/services/forgeService");
const { TIPOS_ACAO_FORJA, SLOTS_FORJA } = require("../src/config/forgeConfig");

async function criarItemEquipavel(nome, raridade = "Raro") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Arma",
    raridade,
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  return item;
}

async function enfileirarFabricacao(characterId, { blueprintId, itemId, raridade, qualidadeFinal }) {
  await CharacterForgeQueue.create({
    id_personagem: characterId,
    slot: SLOTS_FORJA.FORJA,
    tipo_acao: TIPOS_ACAO_FORJA.FABRICACAO,
    referencia: { id_blueprint: blueprintId, nome_blueprint: "Blueprint de teste", qualidade_material: raridade },
    payload_resultado: { id_item: itemId, qualidade_final: qualidadeFinal, xp: 10 },
    iniciado_em: new Date(Date.now() - 60_000),
    pronto_em: new Date(Date.now() - 1000), // já pronto
  });
}

testeComBanco("FORGE_CRAFT_COMPLETED: coleta real de fabricação concede a Proeza", async () => {
  const { personagem } = await criarPersonagem();
  const item = await criarItemEquipavel("Espada de Teste");
  const blueprintId = -(1000 + Math.floor(Math.random() * 100000)); // id fictício, só precisa ser estável

  // raridade do trigger passa a ser a qualidade REAL sorteada da cópia
  // (qualidade_final), não mais item.raridade — Reformulação V2 (ver
  // forgeService.js/equipmentRarityService.js): item.raridade agora é
  // só a identidade canônica "Comum" do equipamento, igual em toda
  // fabricação.
  const { feat } = await criarProeza("FORGE_CRAFT_COMPLETED", { blueprintId, raridade: "Mitico" });
  await enfileirarFabricacao(personagem.id, { blueprintId, itemId: item.id, raridade: item.raridade, qualidadeFinal: "Mitico" });

  const resultado = await forgeService.coletar(personagem.id, SLOTS_FORJA.FORJA);
  assert.equal(resultado.tipo, "fabricacao");
  assert.ok(resultado.proezasConquistadas.some((p) => p.key === feat.key));

  await assertClaimado(feat, personagem.id);
});

testeComBanco("FORGE_CRAFT_COMPLETED: fabricação com blueprintId diferente não conquista nada", async () => {
  const { personagem } = await criarPersonagem();
  const item = await criarItemEquipavel("Espada de Teste");
  const blueprintId = -(1000 + Math.floor(Math.random() * 100000));

  const { feat } = await criarProeza("FORGE_CRAFT_COMPLETED", { blueprintId: blueprintId - 1 });
  await enfileirarFabricacao(personagem.id, { blueprintId, itemId: item.id, raridade: item.raridade, qualidadeFinal: "Mitico" });

  await forgeService.coletar(personagem.id, SLOTS_FORJA.FORJA);
  await assertNaoClaimado(feat);
});

testeComBanco("FORGE_REFINEMENT_COMPLETED: coleta real de refinamento (sucesso) concede a Proeza", async () => {
  const { personagem } = await criarPersonagem();
  const item = await criarItemEquipavel("Espada Refinada de Teste");
  const instancia = await CharacterEquipmentInstance.create({
    id_personagem: personagem.id,
    id_item: item.id,
    refinamento: 3,
    estado: "Inventario",
  });

  const { feat } = await criarProeza("FORGE_REFINEMENT_COMPLETED", { targetLevel: 4, sucesso: true });

  await CharacterForgeQueue.create({
    id_personagem: personagem.id,
    slot: SLOTS_FORJA.FORJA,
    tipo_acao: TIPOS_ACAO_FORJA.REFINAMENTO,
    referencia: {
      id_instancia: instancia.id,
      alvo: 4,
      chance_final_ppm: 500_000,
      id_item_pergaminho: null,
      nome_pergaminho: null,
      ouro_custo: 0,
      categoria_equipamento: item.tipo_item,
      qualidade_item: item.raridade,
    },
    payload_resultado: { sucesso: true, xp: 5 },
    iniciado_em: new Date(Date.now() - 60_000),
    pronto_em: new Date(Date.now() - 1000),
  });

  const resultado = await forgeService.coletar(personagem.id, SLOTS_FORJA.FORJA);
  assert.equal(resultado.tipo, "refinamento");
  assert.equal(resultado.sucesso, true);
  assert.ok(resultado.proezasConquistadas.some((p) => p.key === feat.key));

  await assertClaimado(feat, personagem.id);
});

// =========================================================================
// 4. ALCHEMY_CRAFT_COMPLETED — alchemyService.prepararLote
// =========================================================================
const ConsumableProperties = require("../src/models/ConsumableProperties");
const AlchemyRecipe = require("../src/models/AlchemyRecipe");
const AlchemyRecipeIngredient = require("../src/models/AlchemyRecipeIngredient");
const CharacterInventory = require("../src/models/CharacterInventory");
const alchemyService = require("../src/services/alchemyService");

async function criarReceitaAlquimiaSimples() {
  const itemResultado = await Item.create({
    nome: `Poção de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Consumivel",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 1,
  });
  await ConsumableProperties.create({ id_item: itemResultado.id, efeito_vida: 20, efeito_mana: 0 });

  const itemIngrediente = await Item.create({
    nome: `Ingrediente de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
    valor_compra: 0,
    valor_venda: 1,
  });

  const recipe = await AlchemyRecipe.create({
    key: `RECEITA_TESTE_${sufixo()}`,
    nome: `Receita de teste ${sufixo()}`,
    categoria: "POCAO",
    id_item_resultado: itemResultado.id,
    quantidade_resultado: 1,
    nivel_alquimia_minimo: 1,
    xp_alquimia: 10,
    modo_desbloqueio: "NIVEL",
  });
  await AlchemyRecipeIngredient.create({ id_recipe: recipe.id, id_item: itemIngrediente.id, quantidade: 2 });

  return { recipe, itemIngrediente };
}

testeComBanco("ALCHEMY_CRAFT_COMPLETED: brew real concede a Proeza", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, itemIngrediente } = await criarReceitaAlquimiaSimples();
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemIngrediente.id, quantidade: 10 });

  const { feat } = await criarProeza("ALCHEMY_CRAFT_COMPLETED", { recipeId: recipe.id, resultado: recipe.key });

  const resultado = await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 });
  assert.equal(resultado.idempotent_replay, false);

  await assertClaimado(feat, personagem.id);
});

testeComBanco("ALCHEMY_CRAFT_COMPLETED: brew de OUTRA receita não conquista nada", async () => {
  const { personagem } = await criarPersonagem();
  const { recipe, itemIngrediente } = await criarReceitaAlquimiaSimples();
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemIngrediente.id, quantidade: 10 });

  const { feat } = await criarProeza("ALCHEMY_CRAFT_COMPLETED", { recipeId: recipe.id + 999999 });

  await alchemyService.prepararLote(personagem.id, recipe.id, { quantity: 1 });
  await assertNaoClaimado(feat);
});

// =========================================================================
// 5. FISH_CAUGHT — fishingService.recolher (até CAUGHT)
// =========================================================================
const FishingSpecies = require("../src/models/FishingSpecies");
const FishingZone = require("../src/models/FishingZone");
const FishingZoneSpecies = require("../src/models/FishingZoneSpecies");
const CharacterNavigationState = require("../src/models/CharacterNavigationState");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const fishingService = require("../src/services/fishingService");

async function criarCenarioDePesca() {
  const itemPeixe = await Item.create({
    nome: `Peixe de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  const especie = await FishingSpecies.create({
    key: `especie_teste_${sufixo()}`,
    id_item: itemPeixe.id,
    comportamento_key: "CALM",
    dificuldade_base: 100,
    peso_min_g: 100,
    peso_max_g: 500,
    perfil_peso: "NORMAL",
    pontos_base_torneio: 100,
  });
  const zona = await FishingZone.create({
    key: `zona_teste_${sufixo()}`,
    nome: "Zona de Teste",
    nivel_pesca_minimo: 1,
    tier_embarcacao_minimo: 1,
    dificuldade_ambiente: 100,
  });
  await FishingZoneSpecies.create({ id_zone: zona.id, id_species: especie.id, encounter_weight: 100 });

  const itemVara = await Item.create({
    nome: `Vara de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Ferramenta",
    raridade: "Comum",
    tier_equipamento: 5,
  });
  const FishingRodProperties = require("../src/models/FishingRodProperties");
  await FishingRodProperties.create({
    id_item: itemVara.id,
    forca_linha: 1000,
    controle: 1000,
    recolhimento: 1000,
    precisao: 1000,
    estabilidade: 1000,
    nivel_pesca_minimo: 1,
  });

  return { itemPeixe, especie, zona, itemVara };
}

async function fisgarComRetry(characterId, sessionId, tentativasMax = 90) {
  for (let i = 0; i < tentativasMax; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fishingService.fisgar(characterId, sessionId);
    } catch (e) {
      if (!/ainda não mordeu/.test(e.message)) throw e;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("mordida nunca ficou disponível dentro do tempo de teste");
}

testeComBanco("FISH_CAUGHT: captura real (fase CAUGHT) concede a Proeza", async () => {
  const { personagem } = await criarPersonagem();
  const { especie, zona, itemVara } = await criarCenarioDePesca();
  await CharacterNavigationState.upsert({ id_personagem: personagem.id, id_zone_atual: zona.id, id_port_atual: null });
  const instancia = await equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: itemVara.id, raridade: "Comum" }, null);

  // condicaoId NUNCA sai do contexto real (sempre null — não existe
  // essa dimensão de dado neste sistema) — por isso fica OMITIDO do
  // trigger_config: incluí-lo (mesmo como null) nunca bateria via
  // avaliarCampoEscalar (valorContexto null é tratado como "campo
  // ausente" e sempre retorna false).
  const { feat } = await criarProeza("FISH_CAUGHT", { speciesId: especie.id, zoneId: zona.id });

  const sessao = await fishingService.iniciarSessao(personagem.id, { zoneId: zona.id, rodInstanceId: instancia.id, baitItemId: null });
  await fishingService.lancar(personagem.id, sessao.id);
  const aposFisgar = await fisgarComRetry(personagem.id, sessao.id);
  assert.equal(aposFisgar.fase, "FIGHTING");

  let ultimo = aposFisgar;
  let voltas = 0;
  while (ultimo.fase === "FIGHTING" && voltas < 200) {
    // eslint-disable-next-line no-await-in-loop
    ultimo = await fishingService.recolher(personagem.id, sessao.id, true);
    voltas += 1;
  }
  assert.equal(ultimo.fase, "CAUGHT", `sessão deveria terminar capturada (chegou em ${ultimo.fase} após ${voltas} voltas)`);

  await assertClaimado(feat, personagem.id);
});

// =========================================================================
// 6. NAVIGATION_DISCOVERY — fishingNavigationService.viajar
// =========================================================================
const Vessel = require("../src/models/Vessel");
const CharacterVessel = require("../src/models/CharacterVessel");
const FishingPort = require("../src/models/FishingPort");
const MarineRoute = require("../src/models/MarineRoute");
const WorldMapConnection = require("../src/models/WorldMapConnection");
const WorldMapNode = require("../src/models/WorldMapNode");
const fishingNavigationService = require("../src/services/fishingNavigationService");

async function criarCenarioDeNavegacao() {
  const nodeOrigem = await WorldMapNode.create({ nome: `Nó Origem ${sufixo()}`, tipo: "City", x: 10, y: 10 });
  const nodeDestino = await WorldMapNode.create({ nome: `Nó Destino ${sufixo()}`, tipo: "City", x: 20, y: 20 });
  const conexao = await WorldMapConnection.create({
    id_origem: nodeOrigem.id,
    id_destino: nodeDestino.id,
    tipo: "RotaMaritima",
    ativo: true,
  });

  const porto = await FishingPort.create({ key: `porto_teste_${sufixo()}`, nome: "Porto de Teste", ativo: true });
  const zona = await FishingZone.create({
    key: `zona_nav_teste_${sufixo()}`,
    nome: "Zona de Navegação de Teste",
    nivel_pesca_minimo: 1,
    tier_embarcacao_minimo: 1,
    dificuldade_ambiente: 100,
    ativo: true,
  });
  const rota = await MarineRoute.create({
    id_world_connection: conexao.id,
    id_port_origem: porto.id,
    id_zone_destino: zona.id,
    min_vessel_tier: 1,
    ativo: true,
  });

  const vessel = await Vessel.create({
    key: `vessel_teste_${sufixo()}`,
    nome: "Barco de Teste",
    tier: 1,
    nivel_pesca_minimo: 1,
    preco: 0,
    ativo: true,
  });

  return { nodeOrigem, nodeDestino, conexao, porto, zona, rota, vessel };
}

testeComBanco("NAVIGATION_DISCOVERY: viagem real por uma rota marítima concede a Proeza", async () => {
  const { personagem } = await criarPersonagem();
  const { rota, zona, vessel } = await criarCenarioDeNavegacao();
  await CharacterVessel.create({ id_personagem: personagem.id, id_vessel: vessel.id });

  // Mesmo motivo do FISH_CAUGHT: condicaoId é sempre null no context
  // real, então fica fora do trigger_config (senão nunca bateria).
  const { feat } = await criarProeza("NAVIGATION_DISCOVERY", { rotaId: rota.id, zoneId: zona.id });

  const resultado = await fishingNavigationService.viajar(personagem.id, rota.id);
  assert.equal(resultado.id_zone_atual, zona.id);
  assert.ok(resultado.proezas_conquistadas.some((p) => p.key === feat.key));

  await assertClaimado(feat, personagem.id);
});

testeComBanco("NAVIGATION_DISCOVERY: viagem por OUTRA rota não conquista nada", async () => {
  const { personagem } = await criarPersonagem();
  const { rota, vessel } = await criarCenarioDeNavegacao();
  await CharacterVessel.create({ id_personagem: personagem.id, id_vessel: vessel.id });

  const { feat } = await criarProeza("NAVIGATION_DISCOVERY", { rotaId: rota.id + 999999 });

  await fishingNavigationService.viajar(personagem.id, rota.id);
  await assertNaoClaimado(feat);
});

// =========================================================================
// 7. EXPEDITION_COMPLETED — expeditionService.coletar
// =========================================================================
const ExpeditionRegion = require("../src/models/ExpeditionRegion");
const ExpeditionRegionResource = require("../src/models/ExpeditionRegionResource");
const ExpeditionResource = require("../src/models/ExpeditionResource");
const ExpeditionResourceItem = require("../src/models/ExpeditionResourceItem");
const CharacterProfession = require("../src/models/CharacterProfession");
const expeditionService = require("../src/services/expeditionService");

async function criarCenarioDeExpedicao() {
  const regiao = await ExpeditionRegion.create({
    nome: `Região de Teste ${sufixo()}`,
    profissao: "Mineracao",
    nivel_minimo: 1,
    ativo: true,
  });
  const recurso = await ExpeditionResource.create({
    nome: `Recurso de Teste ${sufixo()}`,
    profissao: "Mineracao",
    ativo: true,
  });
  await ExpeditionRegionResource.create({ id_regiao: regiao.id, id_recurso: recurso.id, peso: 1 });

  const itemRecurso = await Item.create({
    nome: `Fragmento de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  // Vínculo pra TODAS as qualidades possíveis — sortearRecurso/qualidade
  // é RNG real; o teste força o sorteio (ver comSorteioForcado) pra
  // nunca precisar de mais de uma qualidade de verdade, mas cobre as
  // usadas em nível 1 (Comum/Incomum) por robustez.
  for (const qualidade of ["Comum", "Incomum", "Raro", "Epico", "Lendario", "Mitico"]) {
    // eslint-disable-next-line no-await-in-loop
    await ExpeditionResourceItem.create({ id_recurso: recurso.id, qualidade, id_item: itemRecurso.id });
  }

  return { regiao, recurso, itemRecurso };
}

async function comSorteioForcadoParaNada(fn) {
  // Força crypto.randomInt(0, BASE_SORTEIO) a devolver sempre o valor
  // máximo: sortearInterrupcaoDeMonstro() nunca interrompe (999_999 >=
  // CHANCE_MONSTRO_PPM=60_000) e sortearQualidade() sempre estoura o
  // acumulado das qualidades no nível 1 (Comum+Incomum=400_000) —
  // resultado determinístico "Nada", sem tocar em
  // uniqueFeatService/uniqueFeatTriggerRegistry, só no sorteio de RNG
  // que fica ANTES do check() real.
  const original = crypto.randomInt;
  crypto.randomInt = (...args) => {
    const max = args.length >= 2 ? args[1] : args[0];
    return max - 1;
  };
  try {
    return await fn();
  } finally {
    crypto.randomInt = original;
  }
}

testeComBanco("EXPEDITION_COMPLETED: coleta real (mesmo resultando em \"Nada\") concede a Proeza", async () => {
  const { personagem } = await criarPersonagem();
  const { regiao } = await criarCenarioDeExpedicao();
  // garantirProfissoes é lazy-create interno (não exportado) — chamado
  // na primeira consulta de QUALQUER endpoint de Expedição (mesmo
  // caminho que o app real dispara ao abrir a tela antes de coletar).
  await expeditionService.listarProfissoes(personagem.id);

  // Só regiaoId restrito (sem qualidade/resultado) — spec pede exatamente
  // essa robustez porque o resultado da coleta é RNG real.
  const { feat } = await criarProeza("EXPEDITION_COMPLETED", { regiaoId: regiao.id });

  const resultado = await comSorteioForcadoParaNada(() => expeditionService.coletar(personagem.id, regiao.id));
  assert.equal(resultado.interrompida, false);
  assert.equal(resultado.resultado, "Nada");
  assert.ok(resultado.proezas_conquistadas.some((p) => p.key === feat.key));

  await assertClaimado(feat, personagem.id);
});

testeComBanco("EXPEDITION_COMPLETED: coleta em OUTRA região não conquista nada", async () => {
  const { personagem } = await criarPersonagem();
  const { regiao } = await criarCenarioDeExpedicao();
  await expeditionService.listarProfissoes(personagem.id);

  const { feat } = await criarProeza("EXPEDITION_COMPLETED", { regiaoId: regiao.id + 999999 });

  await comSorteioForcadoParaNada(() => expeditionService.coletar(personagem.id, regiao.id));
  await assertNaoClaimado(feat);
});

// =========================================================================
// 8. BESTIARY_EVENT — combatController (encontro de zona real)
// =========================================================================
const combatController = require("../src/controllers/combatController");
const adventureService = require("../src/services/adventureService");

async function vencerUmCombateDeZona(personagemId, zonaId) {
  await adventureService.entrarNaZona(personagemId, zonaId);

  const gerar = reqRes(personagemId, {});
  await combatController.gerarInimigoParaPersonagem(gerar.req, gerar.res);
  assert.equal(gerar.resultado().statusCode, 200, JSON.stringify(gerar.resultado().corpo));

  const personagemDb = await Character.findByPk(personagemId);
  const idMonstro = personagemDb.encontro_pve?.id_monstro ?? null;
  const idArea = personagemDb.encontro_pve?.id_area ?? null;
  personagemDb.encontro_pve = { ...personagemDb.encontro_pve, vida_maxima: 1, vida_atual: 1 };
  await personagemDb.save();

  let ultimaResposta = null;
  for (let turno = 0; turno < 15; turno += 1) {
    const ataque = reqRes(personagemId, { action: { type: "attack" } });
    // eslint-disable-next-line no-await-in-loop
    await combatController.executarTurno(ataque.req, ataque.res);
    ultimaResposta = ataque.resultado();
    if (ultimaResposta.corpo?.data?.done) break;
  }
  assert.ok(ultimaResposta?.corpo?.data?.victory, `não venceu — resposta final: ${JSON.stringify(ultimaResposta?.corpo)}`);
  return { dados: ultimaResposta.corpo.data, idMonstro, idArea };
}

testeComBanco("BESTIARY_EVENT: abate real numa zona concede a Proeza", async () => {
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

  const { personagem } = await criarPersonagem({ nivel: 5 });

  // regiaoId (id_area) é conhecido de antemão (a zona fixa do catálogo);
  // monstroId fica sem restrição porque o monstro sorteado dentro da
  // zona é aleatório — evita depender de qual monstro caiu.
  const { feat } = await criarProeza("BESTIARY_EVENT", { regiaoId: zona.id });

  const { dados, idArea } = await vencerUmCombateDeZona(personagem.id, zona.id);
  assert.equal(idArea, zona.id);
  assert.ok(
    dados.log.some((linha) => linha.includes("escreveu uma nova página na história de Caelum")),
    "log de vitória devia registrar a conquista da Proeza",
  );

  await assertClaimado(feat, personagem.id);
});

testeComBanco("BESTIARY_EVENT: abate real em OUTRA região não conquista nada", async () => {
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona);

  const { personagem } = await criarPersonagem({ nivel: 5 });
  const { feat } = await criarProeza("BESTIARY_EVENT", { regiaoId: -999999 });

  await vencerUmCombateDeZona(personagem.id, zona.id);
  await assertNaoClaimado(feat);
});

// =========================================================================
test.after(async () => {
  if (!temBanco) return;
  await sequelize.close();
});
