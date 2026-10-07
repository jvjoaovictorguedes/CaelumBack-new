const test = require("node:test");
const assert = require("node:assert/strict");
const {
  bancoDisponivel,
  criarPersonagem,
  sufixo,
  sequelize,
} = require("./helpers/db");
const Power = require("../src/models/Power");
const Ability = require("../src/models/CharacterAbilities");
const {
  habilidadesComSlots,
  definirSlot,
} = require("../src/services/combatLoadoutService");
const {
  buscarPoderesDoPersonagem,
} = require("../src/controllers/pvpController");
const { poderesPublicos } = require("../src/socket/pvpLiveSocket");
const controller = require("../src/controllers/characterAbilitiesController");
let available;
const created = [];
test.before(async () => {
  available = await bancoDisponivel();
});
test.after(async () => {
  if (available) {
    await Ability.destroy({ where: { id_power: created } });
    await Power.destroy({ where: { id: created } });
  }
  await sequelize.close();
});
async function fixture() {
  const { personagem } = await criarPersonagem();
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const power = await Power.create({
      nome: `Slot_${sufixo()}`,
      descricao: "Teste de slots",
      tipo_poder: "Ativo",
      custo_mana: 0,
      escala_atributo: "Forca",
      valor_escala: 0,
    });
    created.push(power.id);
    rows.push(
      await Ability.create({
        id_personagem: personagem.id,
        id_power: power.id,
        is_active: false,
      }),
    );
  }
  return { personagem, rows };
}
function dbTest(name, fn) {
  test(name, async (t) => {
    if (!available) return t.skip("Postgres indisponível");
    await fn();
  });
}

test("fallback mantém slots explícitos e ignora passivas sem compactar os espaços", () => {
  const rows = habilidadesComSlots([
    { id: 2, is_active: true, combat_slot: 4, Power: { tipo_poder: "Ativo" } },
    {
      id: 1,
      is_active: true,
      combat_slot: null,
      Power: { tipo_poder: "Ativo" },
    },
    {
      id: 3,
      is_active: true,
      combat_slot: null,
      Power: { tipo_poder: "Passivo" },
    },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.id, r.combat_slot]),
    [
      [1, 0],
      [2, 4],
    ],
  );
});

dbTest(
  "slots escolhidos sobrevivem ao reload e aos payloads de PvP/Grupo/Boss",
  async () => {
    const { personagem, rows } = await fixture();
    await definirSlot(rows[0].id, personagem.id, true, 4);
    await definirSlot(rows[1].id, personagem.id, true, 1);
    const powers = await buscarPoderesDoPersonagem(personagem.id);
    assert.deepEqual(
      powers.map((p) => [p.id, p.combat_slot]),
      [
        [rows[1].id_power, 1],
        [rows[0].id_power, 4],
      ],
    );
    assert.deepEqual(
      poderesPublicos(powers).map((p) => p.combat_slot),
      [1, 4],
    );
    await rows[0].reload();
    assert.equal(rows[0].combat_slot, 4);
    await definirSlot(rows[1].id, personagem.id, false);
    assert.deepEqual(
      (await buscarPoderesDoPersonagem(personagem.id)).map(
        (p) => p.combat_slot,
      ),
      [4],
    );
  },
);

dbTest("substituição e troca entre slots ocupados são atômicas", async () => {
  const { personagem, rows } = await fixture();
  await definirSlot(rows[0].id, personagem.id, true, 0);
  await definirSlot(rows[1].id, personagem.id, true, 2);
  await definirSlot(rows[0].id, personagem.id, true, 2);
  await rows[0].reload();
  await rows[1].reload();
  assert.equal(rows[0].combat_slot, 2);
  assert.equal(rows[1].combat_slot, 0);
  await definirSlot(rows[2].id, personagem.id, true, 2);
  await rows[0].reload();
  assert.equal(rows[0].is_active, false);
  assert.equal(rows[0].combat_slot, null);
  await definirSlot(rows[2].id, personagem.id, true, 2);
  await rows[2].reload();
  assert.equal(
    rows[2].combat_slot,
    2,
    "repetir a seleção não pode apagar o slot",
  );
});

dbTest(
  "pedidos concorrentes respeitam o limite e requisições antigas usam o primeiro vazio",
  async () => {
    const { personagem, rows } = await fixture();
    const result = await Promise.allSettled(
      rows.map((r) => definirSlot(r.id, personagem.id, true)),
    );
    assert.equal(result.filter((r) => r.status === "fulfilled").length, 5);
    const powers = await buscarPoderesDoPersonagem(personagem.id);
    assert.deepEqual(
      powers.map((p) => p.combat_slot),
      [0, 1, 2, 3, 4],
    );
    await assert.rejects(
      definirSlot(rows[0].id, personagem.id, true, 5),
      /Slot/,
    );
  },
);

dbTest(
  "endpoint de ativação rejeita alteração de personagem alheio",
  async () => {
    const { rows } = await fixture();
    let code;
    await controller.toggleCharacterAbility(
      {
        body: { is_active: true, combat_slot: 4 },
        params: { id: rows[0].id },
        user: { id: -1 },
      },
      {
        status(value) {
          code = value;
          return this;
        },
        json() {
          return this;
        },
      },
    );
    assert.equal(code, 403);
    await rows[0].reload();
    assert.equal(rows[0].is_active, false);
  },
);
