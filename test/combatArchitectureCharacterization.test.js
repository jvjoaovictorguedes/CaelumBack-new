// Fase 0: valores observados, não uma proposta de uniformização dos modos.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  bancoDisponivel,
  criarPersonagem,
  sequelize,
  sufixo,
} = require("./helpers/db");
const Character = require("../src/models/Character");
const User = require("../src/models/User");
const Power = require("../src/models/Power");
const Ability = require("../src/models/CharacterAbilities");
const Item = require("../src/models/Item");
const Properties = require("../src/models/ConsumableProperties");
const Effect = require("../src/models/ConsumableEffect");
const Inventory = require("../src/models/CharacterInventory");
const controller = require("../src/controllers/combatController");
const { resolverTurnoComStatus } = require("../src/services/duelEngine");

let available;
let power, item;
const fixtures = [];
const stats = {
  nivel: 1,
  forca: 10,
  vitalidade: 10,
  agilidade: 0,
  inteligencia: 10,
  velocidade: 10,
  defesa: 0,
  arma_equipada: null,
  armaEquipadaEfeitos: [],
  multiplicador_dano_fisico: 1,
  multiplicador_dano_magico: 1,
  multiplicador_vida_por_nivel: 1,
  multiplicador_mana_por_nivel: 1,
};
const silence = () => [
  { key: "SILENCE", remainingTurns: 3, stacks: 1, potency: 0 },
];

test.before(async () => {
  available = await bancoDisponivel();
  if (!available) return;
  power = await Power.create({
    nome: `Baseline Power ${sufixo()}`,
    descricao: "Fixture arquitetural",
    tipo_poder: "Ativo",
    dano_base: 20,
    custo_mana: 5,
    cooldown: 2,
    escala_atributo: "Forca",
    valor_escala: 0.5,
    tipo_dano: "Fisico",
  });
  item = await Item.create({
    nome: `Baseline Item ${sufixo()}`,
    descricao: "Fixture arquitetural",
    tipo_item: "Consumivel",
    raridade: "Comum",
  });
  await Properties.create({
    id_item: item.id,
    efeito_vida: 90,
    efeito_mana: 0,
  });
  await Effect.create({
    id_item: item.id,
    effect_key: "HEAL_HP_PERCENT",
    magnitude: 25,
    ativo: true,
  });
});

test.after(async () => {
  if (!available) {
    await sequelize.close();
    return;
  }
  for (const { personagem, usuario } of fixtures) {
    await Ability.destroy({ where: { id_personagem: personagem.id } });
    await Inventory.destroy({ where: { id_personagem: personagem.id } });
    await Character.destroy({ where: { id: personagem.id } });
    await User.destroy({ where: { id: usuario.id } });
  }
  if (item) {
    await Effect.destroy({ where: { id_item: item.id } });
    await Properties.destroy({ where: { id_item: item.id } });
    await Item.destroy({ where: { id: item.id } });
  }
  if (power) await Power.destroy({ where: { id: power.id } });
  await sequelize.close();
});

async function fixedRandom(fn) {
  const original = Math.random;
  Math.random = () => 0.9; // Acerto sem crítico; variação fixa, incluindo o contra-ataque.
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
}

async function solo(action, status = []) {
  const fixture = await criarPersonagem({ nivel: 1 });
  fixtures.push(fixture);
  const { personagem } = fixture;
  await Ability.create({
    id_personagem: personagem.id,
    id_power: power.id,
    is_active: true,
    combat_slot: 0,
  });
  await Inventory.create({
    id_personagem: personagem.id,
    id_item: item.id,
    quantidade: 2,
  });
  Object.assign(personagem, { vida_atual: 50, mana_atual: 50, agilidade: 0 });
  personagem.encontro_pve = {
    nome: "Baseline Enemy",
    nivel: 1,
    forca: 0,
    vitalidade: 10,
    agilidade: 0,
    velocidade: 0,
    vida_atual: 1000,
    vida_maxima: 1000,
    dano_base: 0,
    defesa: 0,
    criadoEm: Date.now(),
    statsPersonagem: stats,
    statusEffects: { player: status, enemy: [] },
    cooldowns: { player: {}, enemy: {} },
    combatTurn: 0,
  };
  await personagem.save();
  let code, body;
  const res = {
    status(value) {
      code = value;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  await fixedRandom(() =>
    controller.executarTurno(
      { personagemAtual: { id: personagem.id }, body: { action } },
      res,
    ),
  );
  await personagem.reload();
  return {
    code,
    body,
    personagem,
    inventory: await Inventory.findOne({
      where: { id_personagem: personagem.id, id_item: item.id },
    }),
  };
}

async function duel(action, status = []) {
  const actor = { ...stats, id: "baseline-a", vida_atual: 50, mana_atual: 50 };
  const target = {
    ...stats,
    id: "baseline-b",
    vida_atual: 1000,
    mana_atual: 50,
  };
  const result = await fixedRandom(() =>
    resolverTurnoComStatus({
      atacante: actor,
      defensor: target,
      acao: action,
      vidaMaxAtacante: 90,
      manaMaxAtacante: 50,
      statusAtacante: status,
      statusDefensor: [],
      turno: 1,
      casterActorId: "baseline-a",
      nomeAtacante: "Baseline A",
      nomeDefensor: "Baseline B",
      contexto: "PVP_CASUAL",
      armaEfeitosAtacante: [],
    }),
  );
  return { actor, target, result };
}

function integration(name, fn) {
  test(name, async (t) => {
    if (!available)
      return t.skip("Postgres de teste necessário; skips não validam a Fase 0");
    await fn();
  });
}

integration(
  "baseline PvE: ataque básico conserva dano separado do contra-ataque e contrato HTTP",
  async () => {
    const { code, body } = await solo({ type: "attack" });
    assert.equal(code, 200);
    assert.equal(body.status, "success");
    assert.deepEqual(
      {
        done: body.data.done,
        damage: body.data.danoCausadoNoInimigo,
        mana: body.data.character.mana_apos_sua_acao,
        critical: body.data.criticoJogador,
      },
      { done: false, damage: 15, mana: 50, critical: false },
    );
    assert.equal(body.data.enemy.vida_atual, 985);
    assert.equal(body.data.danoStatusInimigo, 0);
  },
);
integration(
  "baseline duelo: ataque básico mantém dano e recursos do ator",
  async () => {
    const { actor, target, result } = await duel({ tipo: "attack" });
    assert.deepEqual(
      {
        damage: result.dano,
        critical: result.critico,
        dodge: result.esquivou,
        hp: actor.vida_atual,
        mp: actor.mana_atual,
        targetHp: target.vida_atual,
      },
      {
        damage: 15,
        critical: false,
        dodge: false,
        hp: 50,
        mp: 50,
        targetHp: 985,
      },
    );
  },
);
integration(
  "baseline PvE: poder conserva escalamento, custo e cooldown recém-aplicado",
  async () => {
    const { code, body } = await solo({ type: "power", powerId: power.id });
    assert.equal(code, 200);
    assert.equal(body.data.danoCausadoNoInimigo, 27);
    assert.equal(body.data.character.mana_apos_sua_acao, 45);
    assert.equal(body.data.cooldowns.player[`power:${power.id}`], 2);
  },
);
integration(
  "baseline duelo: poder conserva escalamento e desconto de mana",
  async () => {
    const { actor, target, result } = await duel({
      tipo: "power",
      power: power.toJSON(),
    });
    assert.deepEqual(
      {
        damage: result.dano,
        mp: actor.mana_atual,
        targetHp: target.vida_atual,
      },
      { damage: 27, mp: 45, targetHp: 973 },
    );
  },
);
integration(
  "baseline PvE: silêncio rejeita poder com 403 sem persistir consumo de turno/mana",
  async () => {
    const { code, body, personagem } = await solo(
      { type: "power", powerId: power.id },
      silence(),
    );
    assert.equal(code, 403);
    assert.equal(
      body.message,
      "Você está silenciado e não pode usar habilidades.",
    );
    assert.equal(personagem.mana_atual, 50);
    assert.equal(personagem.encontro_pve.combatTurn, 0);
    assert.equal(
      personagem.encontro_pve.statusEffects.player[0].remainingTurns,
      3,
    );
  },
);
integration(
  "baseline duelo: silêncio consome o turno bloqueado e decrementa a duração",
  async () => {
    const { actor, target, result } = await duel(
      { tipo: "power", power: power.toJSON() },
      silence(),
    );
    assert.equal(result.bloqueado, true);
    assert.equal(result.dano, 0);
    assert.equal(actor.mana_atual, 50);
    assert.equal(target.vida_atual, 1000);
    assert.equal(result.statusAtacante[0].remainingTurns, 2);
  },
);
integration(
  "baseline PvE: consumível moderno prevalece sobre legado e consome uma unidade",
  async () => {
    const { code, body, inventory } = await solo({
      type: "item",
      itemId: item.id,
    });
    assert.equal(code, 200);
    assert.equal(body.data.character.vida_apos_sua_acao, 73); // 25% do máximo 90, arredondado.
    assert.equal(body.data.character.mana_apos_sua_acao, 50);
    assert.equal(body.data.danoCausadoNoInimigo, 0);
    assert.equal(inventory.quantidade, 1);
  },
);
integration(
  "baseline duelo: consumível moderno prevalece sobre legado sem atacar o alvo",
  async () => {
    const { actor, target, result } = await duel({
      tipo: "item",
      item: item.toJSON(),
      efeito: { efeito_vida: 90, efeito_mana: 0 },
      efeitosConsumiveisModernos: [
        { effect_key: "HEAL_HP_PERCENT", magnitude: 25 },
      ],
    });
    assert.equal(result.cura, 23);
    assert.equal(actor.vida_atual, 73);
    assert.equal(actor.mana_atual, 50);
    assert.equal(target.vida_atual, 1000);
    assert.equal(result.dano, 0);
  },
);

test("baseline Socket.IO: início/resync casual preserva shape público e posições dos poderes", () => {
  const { montarPayloadDuelo } = require("../src/socket/pvpLiveSocket");
  const fighter = (id, hp) => ({
    id,
    nome: `Lutador ${id}`,
    genero: "Masculino",
    classe: "Mago",
    vidaMax: 90,
    manaMax: 50,
    estado: { vida_atual: hp, mana_atual: 40 },
    poderes: [],
    consumiveis: [],
  });
  const a = fighter(101, 70),
    b = fighter(102, 80);
  a.poderes = [
    {
      id: 201,
      combat_slot: 4,
      nome: "Chama",
      custo_mana: 10,
      dano_base: 20,
      cura_base: 0,
      escala_atributo: "Inteligencia",
      valor_escala: 0.5,
    },
  ];
  const payload = JSON.parse(
    JSON.stringify(
      montarPayloadDuelo({
        id: 301,
        arena: "Fixture Arena",
        torneio: null,
        a,
        b,
        turnoDe: "B",
      }),
    ),
  );
  assert.deepEqual(payload, {
    duelId: 301,
    arena: "Fixture Arena",
    torneio: null,
    a: {
      id: 101,
      nome: "Lutador 101",
      genero: "Masculino",
      classe: "Mago",
      chave: "A",
    },
    b: {
      id: 102,
      nome: "Lutador 102",
      genero: "Masculino",
      classe: "Mago",
      chave: "B",
    },
    vidaMaxA: 90,
    vidaMaxB: 90,
    manaMaxA: 50,
    manaMaxB: 50,
    vidaA: 70,
    vidaB: 80,
    manaA: 40,
    manaB: 40,
    poderesA: [
      {
        id: 201,
        combat_slot: 4,
        nome: "Chama",
        imagem_url: null,
        custo_mana: 10,
        dano_base: 20,
        cura_base: 0,
        nivel_habilidade: 1,
        escala_atributo: "Inteligencia",
        valor_escala: 0.5,
      },
    ],
    poderesB: [],
    consumiveisA: [],
    consumiveisB: [],
    turnoDe: "B",
    prazoSegundos: 5,
  });
});
