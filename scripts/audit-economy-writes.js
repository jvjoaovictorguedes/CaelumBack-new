const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Deliberately conservative tripwire. Dynamic SQL and indirect instance writes
// still require review; this is not a transaction verifier or a security boundary.
function scan(root) {
  const findings = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.name.endsWith(".js")) {
        const source = fs.readFileSync(filename, "utf8");
        const pattern = /\b\w+\.dinheiro(?:_total_ganho)?\s*(?:[+\-*/]?=(?!=)|\+\+|--)\s*[^;\n]+|\b(?:CharacterInventory|CharacterEquipmentInstance)\.(?:create|update|destroy|increment|decrement|upsert)\s*\(/g;
        for (const match of source.matchAll(pattern)) {
          // Ignore line comments, including documentation examples.
          const lineStart = source.lastIndexOf("\n", match.index) + 1;
          if (source.slice(lineStart, match.index).trim().startsWith("//")) continue;
          const relative = path.relative(root, filename).replaceAll(path.sep, "/");
          const statement = match[0].replace(/\s+/g, " ").trim();
          findings.push({ file: relative, statement, fingerprint: crypto.createHash("sha256").update(relative + "\0" + statement).digest("hex") });
        }
      }
    }
  }
  for (const folder of ["src/services", "src/controllers"]) {
    if (fs.existsSync(path.join(root, folder))) visit(path.join(root, folder));
  }
  return findings.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}
function compare(current, baseline) {
  const remaining = new Map();
  for (const row of baseline) remaining.set(row.fingerprint, (remaining.get(row.fingerprint) || 0) + 1);
  return current.filter((row) => {
    const count = remaining.get(row.fingerprint) || 0;
    if (!count) return true;
    remaining.set(row.fingerprint, count - 1);
    return false;
  });
}
if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const baseline = JSON.parse(fs.readFileSync(path.join(root, "docs/architecture/economy-writes.json"), "utf8"));
  const unexpected = compare(scan(root), baseline);
  if (unexpected.length) {
    console.error("Unreviewed economy writes:", JSON.stringify(unexpected, null, 2));
    process.exitCode = 1;
  } else console.log("Economy audit passed: no new unreviewed direct writes.");
}
module.exports = { scan, compare };
