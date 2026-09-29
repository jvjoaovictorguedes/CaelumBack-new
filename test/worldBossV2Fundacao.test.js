// Ameaça Mundial V2 — Etapa 1 (migrations/models). Cobre só o SCHEMA
// novo (colunas/tabelas/constraints da migration world-boss-v2-fundacao)
// — nenhuma lógica de runtime/IA/socket ainda (isso são as próximas
// etapas). Deliberadamente em arquivo PRÓPRIO, separado de
// worldBossDiscovery.test.js: nenhum teste aqui cria WorldBossEvent, só
// WorldBossConfig/Phase/Ability/StatusResistance/RankingReward — não
// toca no índice único de "evento aberto", então não compete pela mesma
// linha com os testes de descoberta/combate rodando em paralelo.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const Power = require("../src/models/Power");
const WorldBossConfig = require("../src/models/WorldBossConfig");
const WorldBossPhase = require("../src/models/WorldBossPhase");
const WorldBossAbility = require("../src/models/WorldBossAbility");
const WorldBossStatusResistance = require("../src/models/WorldBossStatusResistance");
const WorldBossRankingReward = require("../src/models/WorldBossRankingReward");
const { REWARD_KIND } = require("../src/config/worldBossConfig");

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
const powersCriados = [];
const configsCriados = [];

test.after(async () => {
  if (!temBanco) return;
  if (configsCriados.length > 0) {
    await WorldBossRankingReward.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossStatusResistance.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossAbility.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossPhase.destroy({ where: { id_world_boss_config: configsCriados } });
    await WorldBossConfig.destroy({ where: { id: configsCriados } });
  }
  if (powersCriados.length > 0) await Power.destroy({ where: { id: powersCriados } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
});

async function criarItem(nome) {
  const item = await Item.create({ nome: `${nome} ${sufixo()}`, descricao: "x", tipo_item: "Material", raridade: "Comum" });
  itensCriados.push(item.id);
  return item;
}

async function criarConfig(overrides = {}) {
  const item = await criarItem("Item Golpe Final");
  const config = await WorldBossConfig.create({
    nome: `Boss Teste ${sufixo()}`,
    descricao: "x",
    mensagem_descoberta: "x",
    mensagem_convocacao: "x",
    vida_base: 1_000_000,
    id_item_golpe_final: item.id,
    ...overrides,
  });
  configsCriados.push(config.id);
  return config;
}

async function criarPower(nome) {
  const power = await Power.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "x",
    tipo_poder: "Ativo",
    escala_atributo: "Inteligencia",
    dano_base: 100,
    custo_mana: 20,
    cooldown: 3,
  });
  powersCriados.push(power.id);
  return power;
}

// ---------------------------------------------------------------------
// WorldBossConfig — novos atributos de combate/raid.
// ---------------------------------------------------------------------

testeComBanco("WorldBossConfig: novos atributos nascem com defaults neutros (rollout seguro §22.1)", async () => {
  const config = await criarConfig();
  assert.equal(config.nivel, 1);
  assert.equal(config.forca, 0);
  assert.equal(config.vitalidade, 0);
  assert.equal(config.agilidade, 0);
  assert.equal(config.inteligencia, 0);
  assert.equal(config.velocidade, 0);
  assert.equal(config.mana_maxima, 0);
  assert.equal(config.regeneracao_mana_por_acao, 0);
  assert.equal(config.intervalo_acao_ms, 3000);
  assert.equal(config.reentrada_permitida, false);
  assert.equal(config.cooldown_reentrada_segundos, 0);
});

testeComBanco("WorldBossConfig: atributos de combate aceitam valores explícitos", async () => {
  const config = await criarConfig({
    nivel: 50,
    forca: 120,
    vitalidade: 100,
    agilidade: 45,
    inteligencia: 85,
    velocidade: 60,
    mana_maxima: 500,
    regeneracao_mana_por_acao: 15,
    intervalo_acao_ms: 3500,
    reentrada_permitida: true,
    cooldown_reentrada_segundos: 30,
  });
  assert.equal(config.nivel, 50);
  assert.equal(config.forca, 120);
  assert.equal(config.mana_maxima, 500);
  assert.equal(config.reentrada_permitida, true);
});

// ---------------------------------------------------------------------
// WorldBossPhase — faixa de dano híbrida + Fúria (spec §5.1/§5.2).
// ---------------------------------------------------------------------

testeComBanco("WorldBossPhase: dano_max >= dano_min é obrigatório no banco (CHECK constraint)", async () => {
  const config = await criarConfig();
  await assert.rejects(
    () =>
      WorldBossPhase.create({
        id_world_boss_config: config.id,
        ordem: 1,
        nome_fase: "Fase Inválida",
        hp_percentual_max: 100,
        dano_min: 200,
        dano_max: 100,
      }),
    /check|constraint/i,
  );
});

testeComBanco("WorldBossPhase: limite_furia_pct NULL representa soft-enrage sem limite (spec §5.4)", async () => {
  const config = await criarConfig();
  const fase = await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Cataclismo",
    hp_percentual_max: 30,
    dano_min: 170,
    dano_max: 220,
    furia_por_acao_pct: 3,
    limite_furia_pct: null,
    intervalo_acao_ms: 2500,
    mana_ao_entrar: 100,
  });
  assert.equal(fase.limite_furia_pct, null);
  assert.equal(Number(fase.furia_por_acao_pct), 3);
  assert.equal(fase.ativo, true);
});

testeComBanco("WorldBossPhase: fase nova sem dano configurado nasce inofensiva (dano_min=dano_max=0)", async () => {
  const config = await criarConfig();
  const fase = await WorldBossPhase.create({
    id_world_boss_config: config.id,
    ordem: 1,
    nome_fase: "Fase Padrão",
    hp_percentual_max: 100,
  });
  assert.equal(fase.dano_min, 0);
  assert.equal(fase.dano_max, 0);
  assert.equal(Number(fase.furia_por_acao_pct), 0);
});

// ---------------------------------------------------------------------
// WorldBossAbility — vínculo Boss -> Power (spec §6.2).
// ---------------------------------------------------------------------

testeComBanco("WorldBossAbility: referencia um Power real e guarda config de IA/alvo/cast", async () => {
  const config = await criarConfig();
  const power = await criarPower("Chamas do Cataclismo");
  const ability = await WorldBossAbility.create({
    id_world_boss_config: config.id,
    id_power: power.id,
    peso_uso: 30,
    prioridade: 10,
    tipo_alvo: "N_ALEATORIOS",
    quantidade_alvos: 3,
    tempo_conjuracao_ms: 2500,
    escala_com_furia: true,
  });
  assert.equal(ability.id_power, power.id);
  assert.equal(ability.tipo_alvo, "N_ALEATORIOS");
  assert.equal(ability.quantidade_alvos, 3);
});

testeComBanco("WorldBossAbility: tipo_alvo fora da whitelist é rejeitado", async () => {
  const config = await criarConfig();
  const power = await criarPower("Golpe Qualquer");
  await assert.rejects(
    () =>
      WorldBossAbility.create({
        id_world_boss_config: config.id,
        id_power: power.id,
        tipo_alvo: "TIPO_INVENTADO",
      }),
    /invalid input value for enum|Validation/i,
  );
});

// ---------------------------------------------------------------------
// WorldBossStatusResistance — reusa a whitelist do motor de status
// existente (spec §7 "obrigatório: não criar um segundo sistema").
// ---------------------------------------------------------------------

testeComBanco("WorldBossStatusResistance: status_key precisa bater com a whitelist do motor de status", async () => {
  const config = await criarConfig();
  await assert.rejects(
    () => WorldBossStatusResistance.create({ id_world_boss_config: config.id, status_key: "NAO_EXISTE" }),
    /Validation/i,
  );
  const resist = await WorldBossStatusResistance.create({
    id_world_boss_config: config.id,
    status_key: "STUN",
    imune: true,
    resistencia_pct: 100,
  });
  assert.equal(resist.status_key, "STUN");
  assert.equal(resist.imune, true);
});

testeComBanco("WorldBossStatusResistance: resistencia_pct fora de 0-100 é rejeitado", async () => {
  const config = await criarConfig();
  await assert.rejects(
    () => WorldBossStatusResistance.create({ id_world_boss_config: config.id, status_key: "SILENCE", resistencia_pct: 150 }),
    /Validation|check|constraint/i,
  );
});

testeComBanco("WorldBossStatusResistance: unique (config, status_key) impede duplicidade", async () => {
  const config = await criarConfig();
  await WorldBossStatusResistance.create({ id_world_boss_config: config.id, status_key: "BLIND", resistencia_pct: 50 });
  await assert.rejects(
    () => WorldBossStatusResistance.create({ id_world_boss_config: config.id, status_key: "BLIND", resistencia_pct: 10 }),
    /unique|duplicate/i,
  );
});

// ---------------------------------------------------------------------
// WorldBossRankingReward — faixas de recompensa por colocação (§11.3).
// ---------------------------------------------------------------------

testeComBanco("WorldBossRankingReward: posicao_fim >= posicao_inicio é obrigatório no banco", async () => {
  const config = await criarConfig();
  await assert.rejects(
    () => WorldBossRankingReward.create({ id_world_boss_config: config.id, posicao_inicio: 5, posicao_fim: 1 }),
    /check|constraint/i,
  );
});

testeComBanco("WorldBossRankingReward: primeira entrega pode cadastrar só o 1º lugar", async () => {
  const config = await criarConfig();
  const item = await criarItem("Prêmio de Maior Dano");
  const premio = await WorldBossRankingReward.create({
    id_world_boss_config: config.id,
    posicao_inicio: 1,
    posicao_fim: 1,
    id_item: item.id,
    quantidade: 1,
    gold: 500,
    xp: 1000,
  });
  assert.equal(premio.posicao_inicio, 1);
  assert.equal(premio.posicao_fim, 1);
});

// ---------------------------------------------------------------------
// REWARD_KIND.TOP_DAMAGE — renomeado de OPTIONAL_TOP (§11.2), mesmo
// pipeline idempotente de sempre (WorldBossRewardGrant).
// ---------------------------------------------------------------------

test("REWARD_KIND expõe TOP_DAMAGE e não expõe mais OPTIONAL_TOP", () => {
  assert.equal(REWARD_KIND.TOP_DAMAGE, "TOP_DAMAGE");
  assert.equal(REWARD_KIND.OPTIONAL_TOP, undefined);
});
