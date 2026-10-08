const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { scan, compare } = require("../scripts/audit-economy-writes");

test("economy guard rejects new and duplicated writes while allowing comments/movement", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "caelum-economy-audit-"));
  try {
    const folder = path.join(root, "src/services");
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, "sample.js");
    fs.writeFileSync(file, "actor.dinheiro += reward;\n");
    const baseline = scan(root);
    assert.equal(baseline.length, 1);
    fs.writeFileSync(file, "// actor.dinheiro += fake;\n\nactor.dinheiro += reward;\n");
    assert.deepEqual(compare(scan(root), baseline), []);
    fs.appendFileSync(file, "actor.dinheiro += reward;\nCharacterInventory.create({});\n");
    assert.equal(compare(scan(root), baseline).length, 2);
    fs.writeFileSync(file, "actor.dinheiro += otherReward;\n");
    assert.equal(compare(scan(root), baseline).length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
