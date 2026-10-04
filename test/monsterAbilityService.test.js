// IA de Combate PvE & Habilidades de Monstros V1 (§4.2/§4.3/§10.1/§12.1)
// — Fase 4: CRUD de MonsterAbility via Admin. Mesmo padrão de sync-by-
// natural-key dos testes de sincronizarStatusEffectsMonstro/loot.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const Power = require("../src/models/Power");
const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterAbility = require("../src/models/MonsterAbility");
require("../src/models/associations");
const { listarAbilitiesDoMonstro, sincronizarAbilitiesMonstro } = require("../src/services/monsterAbilityService");

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

async function criarMonstro() {
  return AdventureMonster.create({
    nome: `Monstro Ability Admin ${sufixo()}`,
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

async function criarPower(usageScope = "MONSTER") {
  return Power.create({
    nome: `Power Admin Teste ${sufixo()}`,
    descricao: "poder de teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: usageScope,
  });
}

testeComBanco("sincronizarAbilitiesMonstro cria, mantém e remove por id_power (natural key)", async () => {
  const monstro = await criarMonstro();
  const powerA = await criarPower();
  const powerB = await criarPower();

  let abilities = await sincronizarAbilitiesMonstro(
    monstro.id,
    [
      { id_power: powerA.id, prioridade_base: 10, target_policy: "PLAYER" },
      { id_power: powerB.id, prioridade_base: 5, target_policy: "SELF" },
    ],
    { idAdmin: 1, req: null },
  );
  assert.equal(abilities.length, 2);

  // Segunda sync: remove powerB, atualiza powerA, nenhuma duplicata.
  abilities = await sincronizarAbilitiesMonstro(
    monstro.id,
    [{ id_power: powerA.id, prioridade_base: 99, target_policy: "LOWEST_HP" }],
    { idAdmin: 1, req: null },
  );
  assert.equal(abilities.length, 1);
  assert.equal(abilities[0].id_power, powerA.id);
  assert.equal(abilities[0].prioridade_base, 99);
  assert.equal(abilities[0].target_policy, "LOWEST_HP");

  await MonsterAbility.destroy({ where: { id_monstro: monstro.id } });
  await powerA.destroy();
  await powerB.destroy();
  await monstro.destroy();
});

testeComBanco("sincronizarAbilitiesMonstro rejeita Power usage_scope CHARACTER", async () => {
  const monstro = await criarMonstro();
  const powerCharacter = await criarPower("CHARACTER");

  await assert.rejects(
    sincronizarAbilitiesMonstro(monstro.id, [{ id_power: powerCharacter.id }], { idAdmin: 1, req: null }),
    /usage_scope CHARACTER/,
  );

  const sobrou = await MonsterAbility.findOne({ where: { id_monstro: monstro.id } });
  assert.equal(sobrou, null, "nada deveria ter sido criado (tudo-ou-nada)");

  await powerCharacter.destroy();
  await monstro.destroy();
});

testeComBanco("sincronizarAbilitiesMonstro rejeita target_policy e condition_key inválidos", async () => {
  const monstro = await criarMonstro();
  const power = await criarPower();

  await assert.rejects(
    sincronizarAbilitiesMonstro(monstro.id, [{ id_power: power.id, target_policy: "QUALQUER_UM" }], { idAdmin: 1, req: null }),
    /target_policy inválida/,
  );

  await assert.rejects(
    sincronizarAbilitiesMonstro(
      monstro.id,
      [{ id_power: power.id, conditions: [{ condition_key: "COISA_INVENTADA", config: {} }] }],
      { idAdmin: 1, req: null },
    ),
    /condition_key inválida/,
  );

  await power.destroy();
  await monstro.destroy();
});

testeComBanco("sincronizarAbilitiesMonstro substitui condições inteiras a cada sync; listarAbilitiesDoMonstro expõe capabilities", async () => {
  const monstro = await criarMonstro();
  const power = await criarPower();
  await Power.update({ dano_base: 25 }, { where: { id: power.id } });

  await sincronizarAbilitiesMonstro(
    monstro.id,
    [
      {
        id_power: power.id,
        conditions: [{ condition_key: "SELF_HP_BELOW_PCT", config: { thresholdPct: 40 }, score_bonus: 20, required: true }],
      },
    ],
    { idAdmin: 1, req: null },
  );

  let lista = await listarAbilitiesDoMonstro(monstro.id);
  assert.equal(lista[0].condicoes.length, 1);
  assert.ok(lista[0].capabilities.includes("DAMAGE"), "Power com dano_base deveria classificar como DAMAGE");

  // Nova sync sem conditions deveria remover a condição antiga por completo.
  await sincronizarAbilitiesMonstro(monstro.id, [{ id_power: power.id }], { idAdmin: 1, req: null });
  lista = await listarAbilitiesDoMonstro(monstro.id);
  assert.equal(lista[0].condicoes.length, 0);

  // Não precisa apagar MonsterAbilityCondition manualmente: a FK pra
  // monster_abilities tem ON DELETE CASCADE. Um destroy({ where: {} })
  // aqui apagaria a tabela inteira (dado compartilhado entre arquivos de
  // teste rodando em paralelo contra o mesmo banco), então nunca usar isso.
  await MonsterAbility.destroy({ where: { id_monstro: monstro.id } });
  await power.destroy();
  await monstro.destroy();
});

testeComBanco("sincronizarAbilitiesMonstro rejeita duas linhas com a mesma Power no mesmo payload", async () => {
  const monstro = await criarMonstro();
  const power = await criarPower();

  await assert.rejects(
    sincronizarAbilitiesMonstro(monstro.id, [{ id_power: power.id }, { id_power: power.id }], { idAdmin: 1, req: null }),
    /mesma Power/,
  );

  await power.destroy();
  await monstro.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
