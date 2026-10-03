// IA de Combate PvE & Habilidades de Monstros V1 (§9.1/§9.2) — Fase 7:
// combatPowerService.calcularPoderMonstroComBuild. Preserva
// calcularPoderMonstro (função pura legada) como fallback pra monstro
// sem build, e evolui o cálculo quando há MonsterAbility de verdade —
// mesma matemática do ataque básico (otimizador guloso de janela de
// dano, mesmo princípio de otimizarJanelaDeDano pro personagem).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterAbility = require("../src/models/MonsterAbility");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
require("../src/models/associations");
const { calcularPoderMonstro, calcularPoderMonstroComBuild } = require("../src/services/combatPowerService");

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

async function criarMonstro(overrides = {}) {
  return AdventureMonster.create({
    nome: `Monstro Poder IA ${sufixo()}`,
    nivel: 10,
    vida_maxima: 500,
    dano_min: 10,
    dano_max: 20,
    agilidade: 5,
    velocidade: 5,
    defesa: 10,
    xp_recompensa: 10,
    ouro_recompensa: 10,
    ...overrides,
  });
}

testeComBanco("monstro sem nenhuma MonsterAbility: calcularPoderMonstroComBuild cai no fallback puro (mesmo resultado)", async () => {
  const monstro = await criarMonstro();
  const semBuild = await calcularPoderMonstroComBuild(monstro.id);
  const legado = calcularPoderMonstro({
    vida_maxima: monstro.vida_maxima,
    dano_min: monstro.dano_min,
    dano_max: monstro.dano_max,
    defesa: monstro.defesa,
  });
  assert.deepEqual(semBuild, legado);
  await monstro.destroy();
});

testeComBanco("MonsterAbility com dano muito maior que o ataque básico aumenta o dpr/combatPower", async () => {
  const monstro = await criarMonstro();
  const poderSemBuild = await calcularPoderMonstroComBuild(monstro.id);

  const powerForte = await Power.create({
    nome: `Power Forte IA ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    dano_base: 200,
  });
  await MonsterAbility.create({ id_monstro: monstro.id, id_power: powerForte.id, cooldown_override: 3 });

  const poderComBuild = await calcularPoderMonstroComBuild(monstro.id);
  assert.ok(poderComBuild.dpr > poderSemBuild.dpr, "dpr deveria subir com uma ability de dano muito mais forte");
  assert.ok(poderComBuild.combatPower > poderSemBuild.combatPower);

  await MonsterAbility.destroy({ where: { id_monstro: monstro.id } });
  await powerForte.destroy();
  await monstro.destroy();
});

testeComBanco("MonsterAbility com status de controle configurado aumenta o utilityFactor", async () => {
  const monstro = await criarMonstro();
  const power = await Power.create({
    nome: `Power Controle IA ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
  });
  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "STUN",
    duration_turns: 1,
    chance_ppm: 1_000_000,
    potency_base: 0,
    target: "Enemy",
  });
  await MonsterAbility.create({ id_monstro: monstro.id, id_power: power.id });

  const poder = await calcularPoderMonstroComBuild(monstro.id);
  assert.ok(poder.utilityFactor > 1, "STUN garantido deveria contar como utilidade de controle");

  await MonsterAbility.destroy({ where: { id_monstro: monstro.id } });
  await power.destroy();
  await monstro.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
