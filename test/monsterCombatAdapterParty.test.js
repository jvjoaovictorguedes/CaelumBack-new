// IA de Combate PvE & Habilidades de Monstros V1 (§8.2) — Fase 6:
// adapter de Party. partySocket.js não tem nenhum teste de handler hoje
// (nem pro combate já existente) — mesmo padrão do projeto, testa as
// funções PURAS do adapter diretamente (decidirAcaoGrupo/
// executarPoderEmGrupo), sem precisar subir socket.io de verdade.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo, sequelize } = require("./helpers/db");
const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterAbility = require("../src/models/MonsterAbility");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
require("../src/models/associations");
const {
  decidirAcaoGrupo,
  executarPoderEmGrupo,
  construirHabilidadesParaEncontro,
  CAPABILITIES_EXECUTAVEIS_PARTY_V1,
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

function inimigoBase(overrides = {}) {
  return {
    nome: "Fera de Grupo",
    vida_atual: 500,
    vida_maxima: 500,
    agilidade: 5,
    velocidade: 5,
    defesa: 0,
    status: [],
    combatBuffs: [],
    ai_profile: "BASIC",
    habilidades: [],
    ...overrides,
  };
}

function membro(overrides = {}) {
  return {
    id: 1,
    nome: "Aliado",
    estado: { vida_atual: 100, defesa: 0 },
    vidaMax: 100,
    status: [],
    combatBuffs: [],
    ...overrides,
  };
}

test("decidirAcaoGrupo: monstro sem habilidades sempre decide attack (regressão §12.1)", () => {
  const decisao = decidirAcaoGrupo({
    inimigo: inimigoBase({ habilidades: [] }),
    membrosVivos: [membro()],
    cooldowns: {},
    combatTurn: 1,
  });
  assert.equal(decisao.type, "attack");
});

test("decidirAcaoGrupo: com ability dominante, escolhe o alvo de MENOR HP quando target_policy é LOWEST_HP", () => {
  const habilidade = {
    id: 1,
    powerId: 100,
    capabilities: ["DAMAGE"],
    prioridadeBase: 999999,
    pesoUso: 1,
    targetPolicy: "LOWEST_HP",
    conditions: [],
  };
  const decisao = decidirAcaoGrupo({
    inimigo: inimigoBase({ habilidades: [habilidade] }),
    membrosVivos: [
      membro({ id: 1, estado: { vida_atual: 90, defesa: 0 }, vidaMax: 100 }),
      membro({ id: 2, estado: { vida_atual: 10, defesa: 0 }, vidaMax: 100 }),
    ],
    cooldowns: {},
    combatTurn: 1,
  });
  assert.equal(decisao.type, "power");
  assert.deepEqual(decisao.targetIds, [2]);
});

test("executarPoderEmGrupo: aplica dano plano e crítico reaproveitando combatFormulas (mesma matemática do ataque básico)", () => {
  const inimigo = inimigoBase();
  const alvoEstado = { vida_atual: 200, defesa: 0 };
  const log = [];
  const habilidade = {
    nome: "Lamina Sombria",
    danoBase: 40,
    curaBase: 0,
    statusEffects: [],
    combatEffectsExecutaveis: [],
  };

  const resultado = executarPoderEmGrupo({
    habilidade,
    inimigo,
    alvoEstado,
    alvoStatus: [],
    alvoBuffs: [],
    modificadoresDefensor: new Map(),
    combatTurn: 1,
    log,
  });

  assert.ok(resultado.dano > 0);
  assert.equal(alvoEstado.vida_atual, 200 - resultado.dano);
  assert.ok(log.some((l) => l.includes("Lamina Sombria")));
});

test("executarPoderEmGrupo: HEAL_HP cura o próprio monstro, nunca ultrapassa vida_maxima", () => {
  const inimigo = inimigoBase({ vida_atual: 480, vida_maxima: 500 });
  const habilidade = { nome: "Regeneração", danoBase: 0, curaBase: 100, statusEffects: [], combatEffectsExecutaveis: [] };

  executarPoderEmGrupo({
    habilidade,
    inimigo,
    alvoEstado: { vida_atual: 100, defesa: 0 },
    alvoStatus: [],
    alvoBuffs: [],
    modificadoresDefensor: new Map(),
    combatTurn: 1,
    log: [],
  });

  assert.equal(inimigo.vida_atual, 500, "nunca pode curar além da vida_maxima");
});

testeComBanco("construirHabilidadesParaEncontro com allowlist de Party filtra SHIELD/REGEN_HP (não wired em Party)", async () => {
  const monstro = await AdventureMonster.create({
    nome: `Monstro Party IA ${sufixo()}`,
    nivel: 5,
    vida_maxima: 100,
    dano_min: 5,
    dano_max: 10,
    agilidade: 5,
    velocidade: 5,
    xp_recompensa: 10,
    ouro_recompensa: 10,
  });
  const powerShield = await Power.create({
    nome: `Power Shield Party ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
  });
  await PowerCombatEffect.create({ id_power: powerShield.id, effect_key: "GRANT_SHIELD", target: "SELF", magnitude_base: 30 });
  const powerDano = await Power.create({
    nome: `Power Dano Party ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    dano_base: 15,
  });

  await MonsterAbility.create({ id_monstro: monstro.id, id_power: powerShield.id });
  await MonsterAbility.create({ id_monstro: monstro.id, id_power: powerDano.id });

  const habilidades = await construirHabilidadesParaEncontro(monstro.id, {
    capabilidadesExecutaveis: CAPABILITIES_EXECUTAVEIS_PARTY_V1,
  });
  assert.equal(habilidades.length, 1, "Power só-SHIELD não é executável em Party (filtrada)");
  assert.equal(habilidades[0].powerId, powerDano.id);

  await MonsterAbility.destroy({ where: { id_monstro: monstro.id } });
  await powerShield.destroy();
  await powerDano.destroy();
  await monstro.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
