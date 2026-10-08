const test = require("node:test");
const assert = require("node:assert/strict");
const { sequelize } = require("./helpers/db");
test.after(() => sequelize.close());
test("PvP: two simultaneous manual/timer calls resolve only one turn across async catalog reads", async (t) => {
  let release;
  const wait = new Promise((r) => {
    release = r;
  });
  const modifiers = require("../src/services/combatModifierService");
  t.mock.method(modifiers, "resolverModificadoresDoPersonagem", async () => {
    await wait;
    return new Map();
  });
  t.mock.method(
    modifiers,
    "resolverGatilhosDoPersonagem",
    async () => new Map(),
  );
  const engine = require("../src/services/duelEngine");
  let resolved = 0;
  t.mock.method(engine, "resolverTurnoComStatus", async () => {
    resolved++;
    return {
      nomeAcao: "Passar o turno",
      dano: 0,
      cura: 0,
      esquivou: false,
      statusAtacante: [],
      statusDefensor: [],
      buffsAtacante: [],
      log: [],
    };
  });
  delete require.cache[require.resolve("../src/socket/pvpLiveSocket")];
  const pvp = require("../src/socket/pvpLiveSocket");
  const fighter = (id) => ({
    id,
    nome: `Player ${id}`,
    estado: { vida_atual: 100, mana_atual: 20 },
    vidaMax: 100,
    manaMax: 20,
  });
  const duel = {
    a: fighter(1),
    b: fighter(2),
    turnoDe: "A",
    acoes: 0,
    statusEffects: { A: [], B: [] },
    sala: "test",
    danoTotalA: 0,
    danoTotalB: 0,
  };
  pvp.duelos.set(999999, duel);
  const io = { to: () => ({ emit: () => {} }) };
  try {
    const first = pvp.executarTurno(io, 999999, "A", { tipo: "pass" });
    await pvp.executarTurno(io, 999999, "A", { tipo: "pass" }, true);
    assert.equal(duel.acoes, 1);
    release();
    await first;
    assert.equal(resolved, 1);
    assert.equal(duel.turnoDe, "B");
    await pvp.executarTurno(io, 999999, "A", { tipo: "pass" });
    assert.equal(resolved, 1);
  } finally {
    release();
    clearTimeout(duel.timer);
    pvp.duelos.delete(999999);
  }
});
