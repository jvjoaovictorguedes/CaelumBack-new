// Evolução do Motor de Status — integração real via combatController
// (mesmo padrão de combatBalance.test.js: chama o controller como o
// Express chamaria, "Boneco de Treino" como encontro determinístico).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
const combatController = require("../src/controllers/combatController");
const Power = require("../src/models/Power");
const PowerStatusEffect = require("../src/models/PowerStatusEffect");
const CharacterAbilities = require("../src/models/CharacterAbilities");
const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const WeaponStatusEffect = require("../src/models/WeaponStatusEffect");

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

function statsPersonagemPadrao(personagem, overrides = {}) {
  return {
    nivel: personagem.nivel,
    forca: personagem.forca,
    vitalidade: personagem.vitalidade,
    agilidade: personagem.agilidade,
    inteligencia: personagem.inteligencia,
    velocidade: personagem.velocidade,
    defesa: 0,
    arma_equipada: null,
    armaEquipadaEfeitos: [],
    multiplicador_vida_por_nivel: 1,
    multiplicador_mana_por_nivel: 1,
    multiplicador_dano_fisico: 1,
    multiplicador_dano_magico: 1,
    ...overrides,
  };
}

async function encontroDeTreino(personagem, overrides = {}, statsOverrides = {}) {
  personagem.encontro_pve = {
    nome: "Boneco de Treino",
    nivel: 1,
    forca: 1,
    vitalidade: 1,
    agilidade: 0,
    velocidade: 1,
    vida_maxima: 1000,
    vida_atual: 1000,
    dano_base: 10,
    defesa: 0,
    criadoEm: Date.now(),
    statsPersonagem: statsPersonagemPadrao(personagem, statsOverrides),
    statusEffects: { player: [], enemy: [] },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
    ...overrides,
  };
  personagem.vida_atual = 200;
  personagem.mana_atual = 100;
  await personagem.save();
}

testeComBanco(
  "Freeze bloqueia toda a ação do jogador (não gera log de ataque) e quebra ao levar dano direto do contra-ataque",
  async (t) => {
    const { personagem } = await criarPersonagem({ nivel: 5 });

    let r = null;
    for (let tentativa = 0; tentativa < 15 && !r?.corpo?.data?.log?.some((l) => l.includes("descongelou")); tentativa += 1) {
      // eslint-disable-next-line no-await-in-loop
      await encontroDeTreino(personagem, {
        statusEffects: {
          player: [
            { key: "FREEZE", sourceActorId: "enemy", sourcePowerId: null, sourceItemId: null, remainingTurns: 3, stacks: 1, potency: 0, appliedAtTurn: 1 },
          ],
          enemy: [],
        },
      });
      // eslint-disable-next-line no-await-in-loop
      r = await chamarExecutarTurno(personagem.id, { type: "attack" });
    }

    assert.equal(r.statusCode, 200);
    assert.ok(r.corpo.data.log.some((l) => l.includes("Congelamento")), "log devia avisar bloqueio por Congelamento");
    assert.ok(!r.corpo.data.log.some((l) => l.includes("Você atacou")), "ação bloqueada não pode causar dano no inimigo");
    assert.equal(r.corpo.data.enemy.vida_atual, 1000, "boneco de treino não pode ter recebido dano nenhum");
    assert.ok(r.corpo.data.log.some((l) => l.includes("descongelou")), "Freeze devia quebrar com o contra-ataque em algum momento");
    assert.equal(
      r.corpo.data.statusEffects.player.some((s) => s.key === "FREEZE"),
      false,
      "Freeze não pode sobrar depois de quebrado",
    );
  },
);

testeComBanco("Stun bloqueia a ação mas NUNCA quebra com dano recebido", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  await encontroDeTreino(personagem, {
    statusEffects: {
      player: [
        { key: "STUN", sourceActorId: "enemy", sourcePowerId: null, sourceItemId: null, remainingTurns: 3, stacks: 1, potency: 0, appliedAtTurn: 1 },
      ],
      enemy: [],
    },
  });

  const r = await chamarExecutarTurno(personagem.id, { type: "attack" });
  assert.equal(r.statusCode, 200);
  assert.ok(r.corpo.data.log.some((l) => l.includes("Atordoamento")));
  assert.ok(!r.corpo.data.log.some((l) => l.includes("Você atacou")));
  // Stun não quebra por dano (diferente de Freeze) — continua ativo mesmo
  // depois do contra-ataque do "Boneco de Treino" ter acertado.
  assert.equal(r.corpo.data.statusEffects.player.some((s) => s.key === "STUN"), true);
});

testeComBanco("tentativa de Power/ataque bloqueada por hard control não gasta mana nem inicia cooldown", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await Power.create({
    nome: `Poder Caro ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 30,
    dano_base: 20,
    escala_atributo: "Inteligencia",
    valor_escala: 1,
    cooldown: 3,
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });

  await encontroDeTreino(personagem, {
    statusEffects: {
      player: [
        { key: "STUN", sourceActorId: "enemy", sourcePowerId: null, sourceItemId: null, remainingTurns: 2, stacks: 1, potency: 0, appliedAtTurn: 1 },
      ],
      enemy: [],
    },
  });

  const manaAntes = personagem.mana_atual;
  const r = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  assert.equal(r.statusCode, 200, "turno bloqueado ainda responde 200 (não é erro, é turno consumido)");
  assert.equal(r.corpo.data.character.mana_atual, manaAntes, "mana não pode ter sido descontada");
  assert.deepEqual(r.corpo.data.cooldowns?.player ?? {}, {}, "cooldown não pode ter iniciado");
});

testeComBanco("Power com efeito target=Self aplica no PRÓPRIO jogador, não no inimigo", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const power = await Power.create({
    nome: `Fúria Interior ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 0,
    escala_atributo: "Inteligencia",
    valor_escala: 0,
    cooldown: 0,
  });
  await PowerStatusEffect.create({
    id_power: power.id,
    status_key: "WEAKEN",
    chance_ppm: 1_000_000,
    duration_turns: 2,
    potency_base: 15,
    potency_scale_value: 0,
    target: "Self",
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });
  await encontroDeTreino(personagem);

  const r = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
  assert.equal(r.statusCode, 200);
  assert.equal(r.corpo.data.statusEffects.player.some((s) => s.key === "WEAKEN"), true, "efeito Self devia cair no jogador");
  assert.equal(r.corpo.data.statusEffects.enemy.some((s) => s.key === "WEAKEN"), false, "efeito Self nunca pode cair no inimigo");
});

testeComBanco("arma equipada com efeito de status (chance 100%) proca no ataque básico com sourceItemId correto", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await Item.create({
    nome: `Espada de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Arma",
    raridade: "Raro",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  await WeaponProperties.create({
    id_item: item.id,
    dano_min: 5,
    dano_max: 5,
    tipo_dano: "Fisico",
    tipo_arma: "Espada",
    bonus_atributo: "Forca",
    valor_bonus_atributo: 0,
  });
  await WeaponStatusEffect.create({
    id_item: item.id,
    status_key: "BLEED",
    chance_ppm: 1_000_000,
    duration_turns: 2,
    potency_base: 4,
    trigger: "BASIC_ATTACK_HIT",
    ativo: true,
  });

  await encontroDeTreino(personagem, {}, {
    arma_equipada: { id_item: item.id, dano_min: 5, dano_max: 5 },
    armaEquipadaEfeitos: [
      { status_key: "BLEED", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 4, potency_scale_attribute: null, potency_scale_value: 0, trigger: "BASIC_ATTACK_HIT", ativo: true },
    ],
  });

  let r = null;
  for (let tentativa = 0; tentativa < 10 && !r?.corpo?.data?.log?.some((l) => l.includes("Sangramento")); tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, {}, {
      arma_equipada: { id_item: item.id, dano_min: 5, dano_max: 5 },
      armaEquipadaEfeitos: [
        { status_key: "BLEED", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 4, potency_scale_attribute: null, potency_scale_value: 0, trigger: "BASIC_ATTACK_HIT", ativo: true },
      ],
    });
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "attack" });
  }

  assert.ok(r.corpo.data.log.some((l) => l.includes("Sua arma aplicou Sangramento")), "proc de arma devia ter acontecido (chance 100%)");
  const bleedInstance = r.corpo.data.statusEffects.enemy.find((s) => s.key === "BLEED");
  assert.ok(bleedInstance, "BLEED devia estar na lista do inimigo");
  assert.equal(bleedInstance.sourceItemId, item.id);
  assert.equal(bleedInstance.sourcePowerId, null);
});

testeComBanco("Power não proca efeito de arma (só ataque básico proca, nunca Power)", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const item = await Item.create({
    nome: `Adaga de Teste ${sufixo()}`,
    descricao: "teste",
    tipo_item: "Arma",
    raridade: "Raro",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
  await WeaponProperties.create({
    id_item: item.id,
    dano_min: 3,
    dano_max: 3,
    tipo_dano: "Fisico",
    tipo_arma: "Adaga",
    bonus_atributo: "Agilidade",
    valor_bonus_atributo: 0,
  });

  const power = await Power.create({
    nome: `Corte Rápido ${sufixo()}`,
    descricao: "teste",
    tipo_poder: "Ativo",
    custo_mana: 0,
    dano_base: 15,
    escala_atributo: "Forca",
    valor_escala: 1,
    cooldown: 0,
  });
  await CharacterAbilities.create({ id_personagem: personagem.id, id_power: power.id, is_active: true, nivel_habilidade: 1 });

  const armaEquipadaEfeitos = [
    { status_key: "POISON", chance_ppm: 1_000_000, duration_turns: 2, potency_base: 4, potency_scale_attribute: null, potency_scale_value: 0, trigger: "BASIC_ATTACK_HIT", ativo: true },
  ];

  let r = null;
  for (let tentativa = 0; tentativa < 10; tentativa += 1) {
    // eslint-disable-next-line no-await-in-loop
    await encontroDeTreino(personagem, {}, {
      arma_equipada: { id_item: item.id, dano_min: 3, dano_max: 3 },
      armaEquipadaEfeitos,
    });
    // eslint-disable-next-line no-await-in-loop
    r = await chamarExecutarTurno(personagem.id, { type: "power", powerId: power.id });
    if (r.corpo.data.log.some((l) => l.includes("causou"))) break;
  }

  assert.ok(r.corpo.data.log.some((l) => l.includes("causou")), "power não acertou em 10 tentativas — investigar");
  assert.equal(
    r.corpo.data.statusEffects.enemy.some((s) => s.key === "POISON"),
    false,
    "Power nunca pode disparar o proc de arma (só BASIC_ATTACK_HIT proca)",
  );
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
