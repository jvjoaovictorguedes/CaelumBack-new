// IA de Combate PvE & Habilidades de Monstros V1 (§8.1/§12.1) — Fase 5:
// integração real na Aventura Solo. Chama combatController.executarTurno
// igual o Express chamaria (mesmo padrão de combatBalance.test.js),
// montando `inimigoAtual.habilidades` direto no encontro_pve pra isolar
// o teste do loader de banco (testado à parte, no describe de
// construirHabilidadesParaEncontro mais abaixo).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");
const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterAbility = require("../src/models/MonsterAbility");
const Power = require("../src/models/Power");
const PowerCombatEffect = require("../src/models/PowerCombatEffect");
require("../src/models/associations");
const { construirHabilidadesParaEncontro } = require("../src/services/monsterCombatAdapter");

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

async function chamarExecutarTurno(characterId, action) {
  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: characterId }, body: { action } };
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
  await combatController.executarTurno(req, res);
  return { statusCode, corpo };
}

const statsPersonagemPadrao = (personagem) => ({
  nivel: personagem.nivel,
  forca: personagem.forca,
  vitalidade: personagem.vitalidade,
  agilidade: personagem.agilidade,
  inteligencia: personagem.inteligencia,
  velocidade: personagem.velocidade,
  defesa: 0,
  arma_equipada: null,
  multiplicador_vida_por_nivel: 1,
  multiplicador_mana_por_nivel: 1,
  multiplicador_dano_fisico: 1,
  multiplicador_dano_magico: 1,
});

async function encontroDeTreino(personagem, overrides = {}) {
  personagem.encontro_pve = {
    nome: "Boneco de Treino com IA",
    nivel: 1,
    forca: 1,
    vitalidade: 1,
    agilidade: 0,
    velocidade: 1,
    vida_maxima: 1000,
    vida_atual: 1000,
    dano_min: 1,
    dano_max: 1,
    defesa: 0,
    criadoEm: Date.now(),
    statsPersonagem: statsPersonagemPadrao(personagem),
    statusEffects: { player: [], enemy: [] },
    combatBuffs: { player: [], enemy: [] },
    escudo: { player: null, enemy: null },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
    ai_profile: "BASIC",
    habilidades: [],
    ...overrides,
  };
  personagem.vida_atual = 200;
  personagem.mana_atual = 100;
  await personagem.save();
}

testeComBanco("monstro sem nenhuma habilidade continua usando só ataque básico (regressão §12.1)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await encontroDeTreino(personagem, { habilidades: [] });

  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await encontroDeTreino(personagem, { habilidades: [] });
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    if (r.corpo.data.log.some((l) => l.includes("Boneco de Treino com IA atacou e causou"))) break;
  }
  assert.ok(r.corpo.data.log.some((l) => l.includes("Boneco de Treino com IA atacou e causou")));
});

testeComBanco("monstro com uma MonsterAbility de dano dominante usa a habilidade em vez do ataque básico", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await encontroDeTreino(personagem, {
    habilidades: [
      {
        id: 1,
        powerId: 9001,
        nome: "Investida Feroz",
        capabilities: ["DAMAGE"],
        prioridadeBase: 999999,
        pesoUso: 1,
        targetPolicy: "PLAYER",
        cooldownConfigurado: 2,
        danoBase: 50,
        curaBase: 0,
        statusEffects: [],
        combatEffectsExecutaveis: [],
        conditions: [],
      },
    ],
  });

  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await encontroDeTreino(personagem, {
      habilidades: [
        {
          id: 1,
          powerId: 9001,
          nome: "Investida Feroz",
          capabilities: ["DAMAGE"],
          prioridadeBase: 999999,
          pesoUso: 1,
          targetPolicy: "PLAYER",
          cooldownConfigurado: 2,
          danoBase: 50,
          curaBase: 0,
          statusEffects: [],
          combatEffectsExecutaveis: [],
          conditions: [],
        },
      ],
    });
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    if (r.corpo.data.log.some((l) => l.includes("Investida Feroz"))) break;
  }

  assert.equal(r.statusCode, 200);
  assert.ok(r.corpo.data.log.some((l) => l.includes("Investida Feroz")), "IA deveria ter escolhido a habilidade dominante");
  assert.ok(
    !r.corpo.data.log.some((l) => l.includes("Boneco de Treino com IA atacou e causou")),
    "não deveria ter caído no ataque básico do monstro",
  );

  // Cooldown real (§8.1): a MESMA habilidade dominante não pode disparar
  // de novo no turno seguinte, mesmo continuando dominante em score —
  // response nunca expõe cooldowns.enemy (só cooldowns.player, de
  // propósito — build do monstro não vaza pro cliente), então a prova é
  // comportamental: continua o MESMO encontro persistido e confirma que
  // o cooldown bloqueou.
  const proximoTurno = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.ok(
    !proximoTurno.corpo.data.log.some((l) => l.includes("Investida Feroz")),
    "habilidade com cooldown 2 não pode repetir no turno imediatamente seguinte",
  );
});

testeComBanco("MonsterAbility de cura só é escolhida quando a condição SELF_HP_BELOW_PCT é satisfeita", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const habilidadeCura = [
    {
      id: 2,
      powerId: 9002,
      nome: "Recuperação Vital",
      capabilities: ["HEAL_HP"],
      prioridadeBase: 999999,
      pesoUso: 1,
      targetPolicy: "SELF",
      cooldownConfigurado: null,
      danoBase: 0,
      curaBase: 40,
      statusEffects: [],
      combatEffectsExecutaveis: [],
      conditions: [{ key: "SELF_HP_BELOW_PCT", config: { thresholdPct: 50 }, scoreBonus: 0, required: true, ativo: true }],
    },
  ];

  // Monstro com HP cheio: a condição falha (required), cura fica inelegível.
  await encontroDeTreino(personagem, { vida_atual: 1000, vida_maxima: 1000, habilidades: habilidadeCura });
  let r = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.ok(!r.corpo.data.log.some((l) => l.includes("Recuperação Vital")), "não deveria curar com HP cheio");

  // Monstro com HP baixo: condição satisfeita, cura vira elegível e domina.
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await encontroDeTreino(personagem, { vida_atual: 100, vida_maxima: 1000, habilidades: habilidadeCura });
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    if (r.corpo.data.log.some((l) => l.includes("Recuperação Vital"))) break;
  }
  assert.ok(r.corpo.data.log.some((l) => l.includes("Recuperação Vital")));
  assert.ok(r.corpo.data.log.some((l) => l.includes("recuperou")));
});

testeComBanco("MonsterAbility de SHIELD concede escudo que absorve o próximo dano do jogador", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const habilidadeShield = [
    {
      id: 3,
      powerId: 9003,
      nome: "Couraça Instantânea",
      capabilities: ["SHIELD"],
      prioridadeBase: 999999,
      pesoUso: 1,
      targetPolicy: "SELF",
      cooldownConfigurado: null,
      danoBase: 0,
      curaBase: 0,
      statusEffects: [],
      combatEffectsExecutaveis: [{ tipo: "SHIELD", magnitude: 30, durationTurns: 3 }],
      conditions: [],
    },
  ];

  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    await encontroDeTreino(personagem, { habilidades: habilidadeShield });
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    if (r.corpo.data.log.some((l) => l.includes("Couraça Instantânea"))) break;
  }
  assert.ok(r.corpo.data.log.some((l) => l.includes("escudo")));
  assert.equal(r.corpo.data.escudo.enemy.valor, 30);
});

testeComBanco("construirHabilidadesParaEncontro carrega só capabilities executáveis da V1 (filtra Power só-buff)", async () => {
  const monstro = await AdventureMonster.create({
    nome: `Monstro IA Encontro ${sufixo()}`,
    nivel: 5,
    vida_maxima: 100,
    dano_min: 5,
    dano_max: 10,
    agilidade: 5,
    velocidade: 5,
    xp_recompensa: 10,
    ouro_recompensa: 10,
  });
  const powerDano = await Power.create({
    nome: `Power Dano Encontro ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    dano_base: 20,
  });
  const powerSoBuff = await Power.create({
    nome: `Power Só Buff Encontro ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
  });
  await PowerCombatEffect.create({ id_power: powerSoBuff.id, effect_key: "CRIT_CHANCE_PCT", target: "SELF", magnitude_base: 20 });

  await MonsterAbility.create({ id_monstro: monstro.id, id_power: powerDano.id, prioridade_base: 10 });
  await MonsterAbility.create({ id_monstro: monstro.id, id_power: powerSoBuff.id, prioridade_base: 5 });

  const habilidades = await construirHabilidadesParaEncontro(monstro.id);
  assert.equal(habilidades.length, 1, "Power só com OFFENSIVE_BUFF (sem capability executável na V1) não deveria virar candidata");
  assert.equal(habilidades[0].powerId, powerDano.id);
  assert.deepEqual(habilidades[0].capabilities, ["DAMAGE"]);

  await MonsterAbility.destroy({ where: { id_monstro: monstro.id } });
  await powerDano.destroy();
  await powerSoBuff.destroy();
  await monstro.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
