const fs = require("fs");
const path = require("path");

function listJsFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(listJsFiles(full));
    } else if (entry.name.endsWith(".js")) {
      results.push(full);
    }
  }
  return results;
}

const requireRe = /require\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g;
let problemas = 0;

for (const file of listJsFiles(path.join(__dirname, "src"))) {
  const content = fs.readFileSync(file, "utf8");
  let match;
  while ((match = requireRe.exec(content))) {
    const importado = match[1];
    let resolvido = path.resolve(path.dirname(file), importado);

    const candidatos = [resolvido, resolvido + ".js", path.join(resolvido, "index.js")];
    let existe = false;
    let existeComCaseErrado = false;

    for (const candidato of candidatos) {
      if (fs.existsSync(candidato)) {
        existe = true;
        break;
      }
      // Confere se existe uma versão com case diferente (o bug que já achamos antes)
      const dir = path.dirname(candidato);
      const base = path.basename(candidato);
      if (fs.existsSync(dir)) {
        const irmaos = fs.readdirSync(dir);
        if (irmaos.some((nome) => nome.toLowerCase() === base.toLowerCase() && nome !== base)) {
          existeComCaseErrado = true;
        }
      }
    }

    if (!existe) {
      problemas++;
      console.log(
        existeComCaseErrado
          ? `[CASE ERRADO] ${path.relative(__dirname, file)} -> require("${importado}") (existe um arquivo com nome parecido, mas com maiúscula/minúscula diferente)`
          : `[NAO ENCONTRADO] ${path.relative(__dirname, file)} -> require("${importado}")`,
      );
    }
  }
}

console.log(`\nTotal de problemas encontrados: ${problemas}`);
process.exit(problemas > 0 ? 1 : 0);
