const fs = require("node:fs");
const path = require("node:path");
function stamp(date) { return date.toISOString().replace(/\D/g, "").slice(0, 14); }
function nextStamp(now, previous) {
  if (stamp(now) > previous) return stamp(now);
  const date = new Date(`${previous.slice(0,4)}-${previous.slice(4,6)}-${previous.slice(6,8)}T${previous.slice(8,10)}:${previous.slice(10,12)}:${previous.slice(12,14)}Z`);
  date.setUTCSeconds(date.getUTCSeconds() + 1);
  return stamp(date);
}
if (require.main === module) {
  const name = process.argv[2];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name || "")) throw new Error("Use: npm run migration:new -- descriptive-kebab-name");
  const root = path.resolve(__dirname, "..");
  const folder = path.join(root, "src/migrations");
  const files = fs.readdirSync(folder).filter((f) => f.endsWith(".js")).sort();
  const now = new Date();
  const filename = `${nextStamp(now, files.at(-1).slice(0,14))}-${name}.js`;
  const manifestPath = path.join(root, "docs/architecture/migration-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const deps = process.argv.slice(3);
  for (const dep of deps) if (!files.includes(dep)) throw new Error(`Unknown dependency: ${dep}`);
  const template = '"use strict";\n\nmodule.exports = {\n  async up(queryInterface, Sequelize) {\n    throw new Error("Implement and review this migration before applying it.");\n  },\n  async down(queryInterface, Sequelize) {\n    throw new Error("Implement the reviewed rollback policy.");\n  },\n};\n';
  fs.writeFileSync(path.join(folder, filename), template, { flag: "wx" });
  manifest[filename] = { createdAt: now.toISOString(), dependsOn: deps };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Created ${filename}; real creation date recorded in manifest.`);
}
module.exports = { nextStamp };
