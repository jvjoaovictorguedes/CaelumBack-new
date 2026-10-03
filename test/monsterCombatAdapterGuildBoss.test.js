// IA de Combate PvE & Habilidades de Monstros V1 (§7/§8.3) — Fase 8:
// adapter de Guild Boss. Mesmo padrão de monsterCombatAdapterParty.test.js
// (guildBossSocket.js não tem teste de handler — testa as funções puras
// direto, mesmo espírito de guildBossCooldown.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const GuildBossConfig = require("../src/models/GuildBossConfig");
const GuildBossAbility = require("../src/models/GuildBossAbility");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
require("../src/models/associations");
const {
  decidirAcaoChefe,
  construirHabilidadesParaGuildBoss,
  CAPABILITIES_EXECUTAVEIS_GUILD_BOSS_V1,
} = require("../src/services/monsterCombatAdapter");

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

function membro(overrides = {}) {
  return { id: 1, estado: { vida_atual: 100, defesa: 0 }, vidaMax: 100, ...overrides };
}

test("decidirAcaoChefe: sem nenhuma GuildBossAbility sempre decide attack (regressão §12.1)", () => {
  const decisao = decidirAcaoChefe({
    vidaRestante: 5000,
    vidaTotal: 10000,
    habilidades: [],
    cooldowns: {},
    vivos: [membro()],
    rodada: 1,
  });
  assert.equal(decisao.type, "attack");
});

test("decidirAcaoChefe: com ability dominante escolhe o alvo certo por target_policy", () => {
  const habilidade = {
    id: 1,
    powerId: 500,
    capabilities: ["DAMAGE"],
    prioridadeBase: 999999,
    pesoUso: 1,
    targetPolicy: "LOWEST_HP",
    conditions: [],
  };
  const decisao = decidirAcaoChefe({
    vidaRestante: 5000,
    vidaTotal: 10000,
    habilidades: [habilidade],
    cooldowns: {},
    vivos: [membro({ id: 1, estado: { vida_atual: 90, defesa: 0 } }), membro({ id: 2, estado: { vida_atual: 10, defesa: 0 } })],
    rodada: 1,
  });
  assert.equal(decisao.type, "power");
  assert.deepEqual(decisao.targetIds, [2]);
});

test("decidirAcaoChefe: respeita cooldown da ability (volta pra attack enquanto em cooldown)", () => {
  const habilidade = { id: 1, powerId: 500, capabilities: ["DAMAGE"], prioridadeBase: 999999, pesoUso: 1, targetPolicy: "PLAYER", conditions: [] };
  const decisao = decidirAcaoChefe({
    vidaRestante: 5000,
    vidaTotal: 10000,
    habilidades: [habilidade],
    cooldowns: { "power:500": 2 },
    vivos: [membro()],
    rodada: 1,
  });
  assert.equal(decisao.type, "attack");
});

testeComBanco("construirHabilidadesParaGuildBoss: Hard rule já filtra capability proibida (HEAL_HP) mesmo se algo escapar do cadastro", async () => {
  const boss = await GuildBossConfig.create({
    rank: `Y${process.pid % 1000}`,
    nome_chefe: `Chefe Loader Teste ${sufixo()}`,
    descricao: "teste",
    vida_total: 10000,
    janela_horas: 24,
    dano_base_ataque: 10,
  });
  const powerCura = await Power.create({
    nome: `Power Cura Loader ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    cura_base: 100,
  });
  const powerDano = await Power.create({
    nome: `Power Dano Loader ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    dano_base: 30,
  });
  // Insere direto no banco (bypass da validação do Admin) pra provar que
  // o LOADER também filtra — defesa em profundidade de verdade.
  await GuildBossAbility.create({ id_guild_boss_config: boss.id, id_power: powerCura.id });
  await GuildBossAbility.create({ id_guild_boss_config: boss.id, id_power: powerDano.id });

  const habilidades = await construirHabilidadesParaGuildBoss(boss.id);
  assert.equal(habilidades.length, 1, "Power de HEAL_HP nunca pode virar candidata de Guild Boss, nem no loader");
  assert.equal(habilidades[0].powerId, powerDano.id);
  assert.deepEqual(habilidades[0].capabilities, CAPABILITIES_EXECUTAVEIS_GUILD_BOSS_V1);

  await GuildBossAbility.destroy({ where: { id_guild_boss_config: boss.id } });
  await powerCura.destroy();
  await powerDano.destroy();
  await boss.destroy();
});

testeComBanco("construirHabilidadesParaGuildBoss: Power com SHIELD (PowerCombatEffect) também é filtrada no loader", async () => {
  const boss = await GuildBossConfig.create({
    rank: `X${process.pid % 1000}`,
    nome_chefe: `Chefe Loader Shield ${sufixo()}`,
    descricao: "teste",
    vida_total: 10000,
    janela_horas: 24,
    dano_base_ataque: 10,
  });
  const powerShield = await Power.create({
    nome: `Power Shield Loader ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
  });
  await PowerCombatEffect.create({ id_power: powerShield.id, effect_key: "GRANT_SHIELD", target: "SELF", magnitude_base: 50 });
  await GuildBossAbility.create({ id_guild_boss_config: boss.id, id_power: powerShield.id });

  const habilidades = await construirHabilidadesParaGuildBoss(boss.id);
  assert.equal(habilidades.length, 0);

  await GuildBossAbility.destroy({ where: { id_guild_boss_config: boss.id } });
  await powerShield.destroy();
  await boss.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
