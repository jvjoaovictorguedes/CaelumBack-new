// A origem é este repositório. O tarball versionado permite builds do Front
// independentes do checkout do Back e sem depender de um registry privado.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const front = process.argv[2];
if (!front) throw new Error("Use: node scripts/export-world-contracts.js /caminho/CaelumFront-new");
const destino = path.resolve(front, "vendor");
fs.mkdirSync(destino, { recursive: true });
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--pack-destination", destino], { cwd: path.resolve(__dirname, "../packages/world-contracts"), stdio: "inherit", shell: process.platform === "win32" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
