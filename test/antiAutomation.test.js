const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { reduce } = require("../src/antiAutomation/automationRiskService");
const {
  defaults,
  validate,
} = require("../src/antiAutomation/automationPolicyService");
const {
  sanitize,
} = require("../src/antiAutomation/automationTelemetryService");
const { exclusive } = require("../src/antiAutomation/actionGuardService");
const Risk = require("../src/models/AutomationRiskState");
const Challenge = require("../src/models/AutomationChallenge");
const challenge = require("../src/antiAutomation/automationChallengeService");
let hasDB = false;
test.before(async () => {
  hasDB = await bancoDisponivel();
});
test.after(async () => {
  if (hasDB) await sequelize.close();
});
test("risk: clamp, decay, independent signals and shadow default", () => {
  const now = Date.now();
  let state = reduce({ score: 0 }, "ACTION_TOO_FAST", now, defaults);
  assert.equal(state.status, "NORMAL");
  for (let i = 0; i < 150; i++)
    state = reduce(state, "ACTION_TOO_FAST", now, defaults);
  assert.equal(state.score, 100);
  assert.notEqual(state.status, "CHALLENGE_PENDING");
  state = reduce(state, "INVALID_STATE", now, defaults);
  assert.equal(state.status, "CHALLENGE_PENDING");
  state = reduce(state, "CHALLENGE_PASSED", now, defaults);
  assert.equal(state.score, 80);
  state = reduce(state, "UNKNOWN", now + 86400000, defaults);
  assert.equal(state.score, 0);
  assert.equal(defaults.shadow_mode, true);
  assert.throws(() => validate({ challenge_threshold: 101 }));
});
test("telemetry sanitization never retains tokens, IP, body or thresholds", () => {
  assert.deepEqual(
    sanitize({
      token: "secret",
      jwt: "secret",
      ip: "1.2.3.4",
      body: { password: "secret" },
      score: 99,
      actionType: "FISHING_REEL",
      transport: "http",
    }),
    { actionType: "FISHING_REEL", transport: "http" },
  );
});
test("exclusive: concurrent action rejected and lock released on exception", async () => {
  let release;
  const pending = new Promise((r) => {
    release = r;
  });
  const first = exclusive("test", () => pending);
  await assert.rejects(
    () => exclusive("test", async () => {}),
    (e) => e.code === "INVALID_ACTION_STATE",
  );
  release();
  await first;
  await assert.rejects(() =>
    exclusive("test", async () => {
      throw new Error("failure");
    }),
  );
  assert.equal(await exclusive("test", async () => 42), 42);
});
test("challenge: shadow gate, valid verification, token replay and provider timeout", async (t) => {
  if (!hasDB) return t.skip("requires local DB");
  const { personagem } = await criarPersonagem();
  await Risk.create({
    id_personagem: personagem.id,
    score: 100,
    signal_families: ["INVALID_STATE", "ACTION_REPLAY"],
  });
  await challenge.gate(personagem.id, "START");
  const c = await Challenge.create({
    id: randomUUID(),
    id_personagem: personagem.id,
    expires_at: new Date(Date.now() + 60000),
  });
  assert.deepEqual(
    await challenge.verify(personagem.id, c.id, "mock-token", async () => true),
    { verified: true },
  );
  const state = await Risk.findByPk(personagem.id);
  assert.equal(state.score, 80);
  assert.ok(state.verified_until > Date.now());
  await assert.rejects(
    () => challenge.verify(personagem.id, c.id, "mock-token", async () => true),
    (e) => e.code === "ACTION_REPLAYED",
  );
  const outage = await Challenge.create({
    id_personagem: personagem.id,
    expires_at: new Date(Date.now() + 60000),
  });
  assert.equal(
    (
      await challenge.verify(
        personagem.id,
        outage.id,
        "mock-token",
        async () => {
          throw new Error("timeout");
        },
      )
    ).providerUnavailable,
    true,
  );
  assert.equal(
    await require("../src/models/AutomationEvent").count({
      where: { id_personagem: personagem.id },
    }),
    0,
  );
  await Risk.destroy({ where: { id_personagem: personagem.id } });
});
