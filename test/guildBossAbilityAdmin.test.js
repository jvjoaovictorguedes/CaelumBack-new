// IA de Combate PvE & Habilidades de Monstros V1 (§7/§8.3/§12.1) —
// Fase 8 (Guild Boss abilities): Admin CRUD + Hard rule de Boss
// coletivo. "Guild Boss e World Boss rejeitam HEAL/HP_REGEN/SHIELD no
// Admin e no runtime" — este arquivo cobre a parte "no Admin".
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const GuildBossConfig = require("../src/models/GuildBossConfig");
const GuildBossAbility = require("../src/models/GuildBossAbility");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
require("../src/models/associations");
const { listarAbilitiesDoGuildBoss, sincronizarAbilitiesGuildBoss } = require("../src/services/monsterAbilityService");

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

let contadorRank = 0;
async function criarBossConfig() {
  contadorRank += 1;
  return GuildBossConfig.create({
    rank: `Z${process.pid % 1000}${contadorRank}`.slice(0, 10),
    nome_chefe: `Chefe Teste ${sufixo()}`,
    descricao: "teste",
    vida_total: 10000,
    janela_horas: 24,
    dano_base_ataque: 10,
  });
}

async function criarPower(overrides = {}) {
  return Power.create({
    nome: `Power Guild Boss Teste ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    ...overrides,
  });
}

testeComBanco("sincronizarAbilitiesGuildBoss rejeita Power com HEAL_HP (Hard rule, nunca entra no banco)", async () => {
  const boss = await criarBossConfig();
  const powerCura = await criarPower({ cura_base: 100 });

  await assert.rejects(
    sincronizarAbilitiesGuildBoss(boss.id, [{ id_power: powerCura.id }], { idAdmin: 1, req: null }),
    /Hard rule/,
  );

  const sobrou = await GuildBossAbility.findOne({ where: { id_guild_boss_config: boss.id } });
  assert.equal(sobrou, null, "nada deveria ter sido criado (tudo-ou-nada)");

  await powerCura.destroy();
  await boss.destroy();
});

testeComBanco("sincronizarAbilitiesGuildBoss rejeita Power com SHIELD (PowerCombatEffect GRANT_SHIELD)", async () => {
  const boss = await criarBossConfig();
  const powerShield = await criarPower();
  await PowerCombatEffect.create({ id_power: powerShield.id, effect_key: "GRANT_SHIELD", target: "SELF", magnitude_base: 50 });

  await assert.rejects(
    sincronizarAbilitiesGuildBoss(boss.id, [{ id_power: powerShield.id }], { idAdmin: 1, req: null }),
    /Hard rule/,
  );

  await powerShield.destroy();
  await boss.destroy();
});

testeComBanco("sincronizarAbilitiesGuildBoss aceita Power de DAMAGE normalmente", async () => {
  const boss = await criarBossConfig();
  const powerDano = await criarPower({ dano_base: 50 });

  const abilities = await sincronizarAbilitiesGuildBoss(boss.id, [{ id_power: powerDano.id, prioridade_base: 10 }], {
    idAdmin: 1,
    req: null,
  });
  assert.equal(abilities.length, 1);
  assert.equal(abilities[0].id_power, powerDano.id);

  const listagem = await listarAbilitiesDoGuildBoss(boss.id);
  assert.equal(listagem.length, 1);
  assert.ok(listagem[0].capabilities.includes("DAMAGE"));

  await GuildBossAbility.destroy({ where: { id_guild_boss_config: boss.id } });
  await powerDano.destroy();
  await boss.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
