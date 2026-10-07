const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");

function testTarget(env) {
  if (env.NODE_ENV !== "test") throw new Error("Migration fixtures require NODE_ENV=test.");
  const url = env.MIGRATION_TEST_DATABASE_URL
    ? new URL(env.MIGRATION_TEST_DATABASE_URL)
    : new URL("postgres://localhost");
  if (!env.MIGRATION_TEST_DATABASE_URL) {
    url.hostname = env.DB_HOST || "localhost";
    url.port = env.DB_PORT || "5432";
    url.username = env.DB_USER || "postgres";
    url.password = env.DB_PASSWORD || "";
    url.pathname = `/${env.DB_NAME || ""}`;
  }
  const name = url.pathname.slice(1);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || !/(?:_test|_ci)$|^caelum_architecture_[a-z0-9_]+$/.test(name)
    || !["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Use an explicitly named local test/CI database; production targets are rejected.");
  }
  return url.toString();
}

async function migrateTestDatabase(env = process.env) {
  const target = testTarget(env);
  const root = path.resolve(__dirname, "..");
  const childEnv = { ...env, NODE_ENV: "test", DATABASE_URL: target, POSTGRES_URL: "", DB_SSL: "false" };
  function migrate(args = []) {
    const result = spawnSync(process.execPath, ["node_modules/sequelize-cli/lib/sequelize", "db:migrate", ...args], {
      cwd: root, env: childEnv, stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Test database migration failed.");
  }
  migrate(["--to", "20270204010000-seed-monster-active-abilities.js"]);
  const client = new Client({ connectionString: target });
  await client.connect();
  try {
    // This historical data migration requires 40 Admin-created catalog rows
    // absent from repository history. Inactive fixtures satisfy that precondition
    // only in disposable tests; they are not a production catalog or balance data.
    const names = JSON.parse(fs.readFileSync(path.join(root, "test/fixtures/legacy-migration-monsters.json"), "utf8"));
    await client.query("BEGIN");
    for (const name of names) {
      await client.query(`INSERT INTO "AdventureMonsters"
        (nome, descricao, multiplicador_vida, multiplicador_dano, multiplicador_agilidade, multiplicador_velocidade, ativo, disponivel_emboscada, "createdAt", "updatedAt")
        VALUES ($1, 'Inactive migration precondition fixture; not gameplay data', 1, 1, 1, 1, false, false, NOW(), NOW())
        ON CONFLICT (nome) DO NOTHING`, [name]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  migrate();
  // Second execution must report no pending migrations, not reapply history.
  migrate();
}

if (require.main === module) migrateTestDatabase().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { testTarget, migrateTestDatabase };
