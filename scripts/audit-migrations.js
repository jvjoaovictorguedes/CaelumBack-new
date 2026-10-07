const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function audit(folder, legacy, manifest) {
  const issues = [];
  const actual = fs.readdirSync(folder).filter((name) => name.endsWith(".js")).sort();
  for (const [name, digest] of Object.entries(legacy)) {
    if (!actual.includes(name)) issues.push(`Historical migration removed: ${name}`);
    else if (hash(fs.readFileSync(path.join(folder, name))) !== digest) issues.push(`Historical migration changed: ${name}`);
  }
  const lastLegacy = Object.keys(legacy).sort().at(-1) || "";
  const stamps = new Set();
  for (const name of actual.filter((name) => !Object.hasOwn(legacy, name))) {
    if (!/^\d{14}-[a-z0-9]+(?:-[a-z0-9]+)*\.js$/.test(name)) issues.push(`Invalid migration name: ${name}`);
    if (name <= lastLegacy) issues.push(`Migration must sort after immutable legacy history: ${name}`);
    const stamp = name.slice(0, 14);
    if (stamps.has(stamp)) issues.push(`Duplicate new migration prefix: ${stamp}`);
    stamps.add(stamp);
    const record = manifest[name];
    if (!record || !Number.isFinite(Date.parse(record.createdAt)) || !Array.isArray(record.dependsOn)) issues.push(`Missing creation timestamp/dependency metadata: ${name}`);
    else for (const dependency of record.dependsOn) {
      if (!actual.includes(dependency) || dependency >= name) issues.push(`Invalid dependency ${dependency} in ${name}`);
    }
  }
  for (const name of Object.keys(manifest)) if (!actual.includes(name) || Object.hasOwn(legacy, name)) issues.push(`Invalid manifest entry: ${name}`);
  return issues;
}
if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const load = (name) => JSON.parse(fs.readFileSync(path.join(root, "docs/architecture", name), "utf8"));
  const issues = audit(path.join(root, "src/migrations"), load("migration-legacy.json"), load("migration-manifest.json"));
  if (issues.length) { console.error(issues.join("\n")); process.exitCode = 1; }
  else console.log("Migration audit passed: historical files unchanged; new files ordered and registered.");
}
module.exports = { audit, hash };
