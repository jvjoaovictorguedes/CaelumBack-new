// IA de Combate PvE & Habilidades de Monstros V1 (§4/§11.1/§12.1) —
// Fase 1 (schema). Valida só o que o rollout pede nesta fase: colunas
// novas com default seguro, FKs/unique corretas de monster_abilities/
// monster_ability_conditions/guild_boss_abilities, e o guard central de
// usage_scope (§4.1 "Powers MONSTER não podem ser aprendidas via
// CharacterAbilities... validação no serviço central de aprendizagem").
// Nenhum teste aqui toca combatAiService (ainda não existe — Fase 3).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const Power = require("../src/models/Power");
const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterAbility = require("../src/models/MonsterAbility");
const MonsterAbilityCondition = require("../src/models/MonsterAbilityCondition");
const GuildBossConfig = require("../src/models/GuildBossConfig");
const GuildBossAbility = require("../src/models/GuildBossAbility");
const CharacterAbilities = require("../src/models/CharacterAbilities");
require("../src/models/associations");
const powerLearningService = require("../src/services/powerLearningService");
const { garantirPowerUsavelPorPersonagem } = require("../src/services/powerUsageScopeGuard");

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

async function criarPower({ usageScope = "CHARACTER", tipoPoder = "Ativo" } = {}) {
  return Power.create({
    nome: `Power Teste IA ${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: tipoPoder,
    escala_atributo: "Forca",
    usage_scope: usageScope,
  });
}

async function criarMonstro() {
  return AdventureMonster.create({
    nome: `Monstro Teste IA ${sufixo()}`,
    nivel: 5,
    vida_maxima: 100,
    dano_min: 5,
    dano_max: 10,
    agilidade: 5,
    velocidade: 5,
    xp_recompensa: 10,
    ouro_recompensa: 10,
  });
}

testeComBanco("Power.usage_scope default é CHARACTER e não quebra criação legada", async () => {
  const power = await criarPower({ usageScope: undefined });
  assert.equal(power.usage_scope, "CHARACTER");
  await power.destroy();
});

testeComBanco("AdventureMonster.ai_profile default é BASIC", async () => {
  const monstro = await criarMonstro();
  assert.equal(monstro.ai_profile, "BASIC");
  await monstro.destroy();
});

testeComBanco("MonsterAbility: cria vínculo monstro+power MONSTER, unique (id_monstro,id_power) é respeitado", async () => {
  const monstro = await criarMonstro();
  const power = await criarPower({ usageScope: "MONSTER" });

  const ability = await MonsterAbility.create({ id_monstro: monstro.id, id_power: power.id, target_policy: "PLAYER" });
  assert.equal(ability.ativo, true);
  assert.equal(ability.peso_uso, 1);

  await assert.rejects(
    MonsterAbility.create({ id_monstro: monstro.id, id_power: power.id, target_policy: "PLAYER" }),
    /Sequelize/,
    "mesma Power duas vezes pro mesmo monstro deve ser rejeitado pelo unique",
  );

  await ability.destroy();
  await power.destroy();
  await monstro.destroy();
});

testeComBanco("MonsterAbilityCondition: pendurada numa MonsterAbility, removida em cascata", async () => {
  const monstro = await criarMonstro();
  const power = await criarPower({ usageScope: "MONSTER" });
  const ability = await MonsterAbility.create({ id_monstro: monstro.id, id_power: power.id });

  const condicao = await MonsterAbilityCondition.create({
    id_monster_ability: ability.id,
    condition_key: "SELF_HP_BELOW_PCT",
    config: { thresholdPct: 40 },
    score_bonus: 50,
    required: true,
  });
  assert.equal(condicao.ativo, true);

  await ability.destroy();
  const aindaExiste = await MonsterAbilityCondition.findByPk(condicao.id);
  assert.equal(aindaExiste, null, "condição deveria cair em cascata com a ability (FK CASCADE)");

  await power.destroy();
  await monstro.destroy();
});

testeComBanco("GuildBossAbility: vínculo com GuildBossConfig existente, unique (config,power)", async () => {
  const config = await GuildBossConfig.findOne();
  if (!config) {
    return; // seed de Guild Boss não rodou neste ambiente — nada a validar aqui.
  }
  const power = await criarPower({ usageScope: "MONSTER" });

  const ability = await GuildBossAbility.create({ id_guild_boss_config: config.id, id_power: power.id });
  await assert.rejects(
    GuildBossAbility.create({ id_guild_boss_config: config.id, id_power: power.id }),
    /Sequelize/,
  );

  await ability.destroy();
  await power.destroy();
});

testeComBanco("garantirPowerUsavelPorPersonagem rejeita MONSTER e aceita CHARACTER/BOTH", async () => {
  const monsterPower = await criarPower({ usageScope: "MONSTER" });
  const charPower = await criarPower({ usageScope: "CHARACTER" });
  const bothPower = await criarPower({ usageScope: "BOTH" });

  assert.throws(() => garantirPowerUsavelPorPersonagem(monsterPower), /usage_scope MONSTER/);
  assert.doesNotThrow(() => garantirPowerUsavelPorPersonagem(charPower));
  assert.doesNotThrow(() => garantirPowerUsavelPorPersonagem(bothPower));

  await monsterPower.destroy();
  await charPower.destroy();
  await bothPower.destroy();
});

testeComBanco("powerLearningService.grantPower rejeita Power usage_scope MONSTER de verdade (defesa em profundidade)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const monsterPower = await criarPower({ usageScope: "MONSTER", tipoPoder: "Passivo" });

  await assert.rejects(
    powerLearningService.grantPower({ characterId: personagem.id, idPower: monsterPower.id, levelLearned: 1 }),
    /usage_scope MONSTER/,
  );

  const aprendeu = await CharacterAbilities.findOne({ where: { id_personagem: personagem.id, id_power: monsterPower.id } });
  assert.equal(aprendeu, null, "nenhuma linha deveria ter sido criada");

  await monsterPower.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
