const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { audit, hash } = require("../scripts/audit-migrations");
const { nextStamp } = require("../scripts/create-migration");
const { testTarget } = require("../scripts/migrate-test-database");

test("legacy bootstrap refuses production mode, remote hosts and unnamed production databases", () => {
  assert.throws(() => testTarget({ NODE_ENV: "production", DB_NAME: "caelum_test" }), /NODE_ENV=test/);
  assert.throws(() => testTarget({ NODE_ENV: "test", MIGRATION_TEST_DATABASE_URL: "postgres://database.example/caelum_test" }), /production targets are rejected/);
  assert.throws(() => testTarget({ NODE_ENV: "test", MIGRATION_TEST_DATABASE_URL: "postgres://localhost/production" }), /production targets are rejected/);
  assert.equal(new URL(testTarget({ NODE_ENV: "test", DB_NAME: "gamerpg_ci" })).pathname, "/gamerpg_ci");
});

test("new prefixes follow immutable future-dated legacy while recording the real creation date", () => {
  assert.equal(nextStamp(new Date("2026-10-07T12:00:00Z"), "20270206010000"), "20270206010001");
  assert.equal(nextStamp(new Date("2027-02-07T12:00:00Z"), "20270206010000"), "20270207120000");
  assert.equal(nextStamp(new Date("2026-10-07T12:00:00Z"), "20271231235959"), "20280101000000");
});

test("migration guard rejects historical edits and unregistered/out-of-order new files", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "caelum-migration-policy-"));
  try {
    const old = "20270206010000-old.js";
    const source = "module.exports = {};\n";
    fs.writeFileSync(path.join(folder, old), source);
    const legacy = { [old]: hash(source) };
    assert.deepEqual(audit(folder, legacy, {}), []);
    fs.writeFileSync(path.join(folder, old), "// changed\n");
    assert.match(audit(folder, legacy, {}).join("\n"), /Historical migration changed/);
    fs.writeFileSync(path.join(folder, old), source);
    const next = "20270206010001-next.js";
    fs.writeFileSync(path.join(folder, next), source);
    assert.match(audit(folder, legacy, {}).join("\n"), /Missing creation/);
    const manifest = { [next]: { createdAt: "2026-10-07T12:00:00Z", dependsOn: [old] } };
    assert.deepEqual(audit(folder, legacy, manifest), []);
    manifest[next].dependsOn = ["unknown.js"];
    assert.match(audit(folder, legacy, manifest).join("\n"), /Invalid dependency/);
    fs.writeFileSync(path.join(folder, "20261007120000-too-early.js"), source);
    assert.match(audit(folder, legacy, manifest).join("\n"), /sort after immutable legacy/);
    fs.writeFileSync(path.join(folder, "20270230010000-invalid-date.js"), source);
    assert.match(audit(folder, legacy, manifest).join("\n"), /Invalid calendar timestamp/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
