const test = require("node:test");
const assert = require("node:assert/strict");
const { buildClassArticles, publicPaths } = require("../src/services/wikiClassService");
function fixture() {
  return {
    classes: [{ id: 1, nome: "Guerreiro", ativo: true, multiplicador_vida_por_nivel: 1.5 }],
    paths: [{ id: 1, id_classe: 1, nome: "Berserker", estagio: 1, ativo: true, nivel_necessario: 40, descricao: "Fúria pura." }, { id: 2, id_classe: 1, nome: "Titã", estagio: 2, ativo: true, id_evolucao_pai: 1 }],
    requirements: [{ id_evolucao: 1, tipo: "LEVEL", quantidade: 50 }, { id_evolucao: 1, tipo: "MONSTER_KILL", quantidade: 150, reference_key: "Minotauro" }, { id_evolucao: 1, tipo: "ITEM", reference_id: 10, quantidade: 2 }],
    abilities: [{ id_evolucao: 1, id_power: 10, auto_conceder: true, ativar_se_houver_slot: true }],
    items: [{ id: 10, nome: "Relíquia" }],
    powers: [{ id: 10, nome: "Fúria", descricao: "Ataque", dano_base: 80, valor_escala: 1.5, escala_atributo: "Forca", usage_scope: "CHARACTER", acquisition_scope: "NORMAL" }],
    discoveries: new Set(),
  };
}
test("Requirements use live V2 rows instead of obsolete level column", () => {
  const article = buildClassArticles(fixture())[0];
  assert.match(article.conteudo, /Nível 50/);
  assert.doesNotMatch(article.conteudo, /Nível 40/);
  assert.match(article.conteudo, /2 × Relíquia/);
  assert.match(article.conteudo, /Titã/);
});
test("Undiscovered hunt targets stay hidden until this character discovers them", () => {
  const f = fixture(); assert.doesNotMatch(buildClassArticles(f)[0].conteudo, /Minotauro/);
  f.discoveries.add("Minotauro"); assert.match(buildClassArticles(f)[0].conteudo, /Minotauro/);
});
test("Inactive ancestors, orphan paths and cross-class parents stay hidden", () => {
  const f = fixture(); f.paths[0].ativo = false;
  assert.equal(publicPaths(f.classes, f.paths).length, 0);
  f.paths[0].ativo = true; f.paths[1].id_evolucao_pai = 99;
  assert.equal(publicPaths(f.classes, f.paths).length, 1);
  f.paths[1].id_evolucao_pai = 1; f.paths[1].id_classe = 2;
  assert.equal(publicPaths([...f.classes, { id: 2, ativo: true }], f.paths).length, 1);
});
test("Ability base, scaling and automatic acquisition are explained", () => {
  const article = buildClassArticles(fixture())[0];
  assert.match(article.conteudo, /Dano \| 80/);
  assert.match(article.conteudo, /1,5 × Força/);
  assert.match(article.conteudo, /slot livre/);
});
test("Monster-only and unique feat powers cannot appear as evolution unlocks", () => {
  for (const field of ["usage_scope", "acquisition_scope"]) {
    const f = fixture(); f.powers[0][field] = field === "usage_scope" ? "MONSTER" : "UNIQUE_FEAT";
    assert.doesNotMatch(buildClassArticles(f)[0].conteudo, /#### Fúria/);
  }
});
test("Live edits change requirement and class multiplier without seeds", () => {
  const f = fixture(); buildClassArticles(f);
  f.requirements[0].quantidade = 60; f.classes[0].multiplicador_vida_por_nivel = 1.8;
  const article = buildClassArticles(f)[0]; assert.match(article.conteudo, /Nível 60/); assert.match(article.conteudo, /1,8×/);
});
