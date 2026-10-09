const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPowerArticles, progressionGuide } = require("../src/services/wikiPowerService");
function fixture() {
  return { learned: [], classes: [{ id: 1, nome: "Mago", ativo: true }], races: [], paths: [], classBindings: [{ id_classe: 1, id_poder: 1, nivel_aprendizagem: 5, custo_ouro: 200 }], raceBindings: [], evolutionBindings: [], books: [], items: [], statuses: [], effects: [], powers: [{ id: 1, nome: "Fogo", tipo_poder: "Ativo", descricao: "Chama", usage_scope: "CHARACTER", acquisition_scope: "NORMAL", dano_base: 40, valor_escala: 1.2, escala_atributo: "Inteligencia", custo_mana: 12, cooldown: 3 }, { id: 2, nome: "Segredo", usage_scope: "CHARACTER", acquisition_scope: "NORMAL" }, { id: 3, nome: "Monstro", usage_scope: "MONSTER", acquisition_scope: "NORMAL" }, { id: 4, nome: "Proeza", usage_scope: "CHARACTER", acquisition_scope: "UNIQUE_FEAT" }] };
}
test("Only publicly obtainable powers or this character learned powers are listed", () => {
  const data = fixture(); const result = buildPowerArticles(data);
  assert.equal(result.length, 2); assert.equal(result[1].titulo, "Fogo");
  assert.doesNotMatch(JSON.stringify(result), /Segredo|Monstro|Proeza/);
  assert.match(result[1].conteudo, /nível 5, compra por 200/);
});
test("Unique feats stay private even if incorrectly bound to a class", () => {
  const data = fixture(); data.classBindings.push({ id_classe: 1, id_poder: 4 });
  assert.ok(!buildPowerArticles(data).some(a => a.titulo === "Proeza"));
  data.learned.push({ id_power: 4, nivel_habilidade: 3, is_active: true });
  const own = buildPowerArticles(data).find(a => a.titulo === "Proeza");
  assert.equal(own.aprendida, true); assert.match(own.conteudo, /nível de habilidade \*\*3\*\*/);
  assert.doesNotMatch(own.conteudo, /Classe Mago/);
});
test("Monster-only powers remain absent even with corrupted learned records", () => {
  const data = fixture(); data.learned.push({ id_power: 3 });
  assert.ok(!buildPowerArticles(data).some(a => a.titulo === "Monstro"));
});
test("Inactive class and evolution lineage cannot publish hidden powers", () => {
  const data = fixture(); data.classes[0].ativo = false;
  data.paths.push({ id: 1, id_classe: 1, ativo: true, estagio: 1, nome: "Futuro" });
  data.evolutionBindings.push({ id_evolucao: 1, id_power: 2 });
  assert.equal(buildPowerArticles(data).length, 1);
});
test("Books require an active binding and a real skill book item; prerequisites remain private", () => {
  const data = fixture(); data.books.push({ id_item: 10, id_power: 2, ativo: true, nivel_minimo: 7, id_power_prerequisito: 4, nivel_power_prerequisito: 2 });
  data.items.push({ id: 10, nome: "Grimório", tipo_item: "LivroHabilidade" });
  const article = buildPowerArticles(data).find(a => a.titulo === "Segredo");
  assert.match(article.conteudo, /Livro Grimório: nível 7/); assert.match(article.conteudo, /ainda não revelada no nível 2/); assert.doesNotMatch(article.conteudo, /Proeza/);
  data.books[0].ativo = false; assert.ok(!buildPowerArticles(data).some(a => a.titulo === "Segredo"));
});
test("Status and modifiers use proper units, chance precision, conditions and contexts", () => {
  const data = fixture(); data.statuses.push({ id_power: 1, ativo: true, status_key: "BURN", target: "Enemy", chance_ppm: 1, duration_turns: 2, percentual_vida_maxima: 4 });
  data.effects.push({ id_power: 1, ativo: true, effect_key: "DAMAGE_DEALT_PCT", magnitude_base: -20, chance_ppm: 1000, trigger: "ON_CAST", target: "SELF", condition_key: "SELF_HP_BELOW_PCT", condition_config: { limite_pct: 30 }, allow_pve: true, reapply_policy: "STRONGEST" });
  data.effects.push({ id_power: 1, ativo: false, effect_key: "DEFENSE_FLAT", magnitude_base: 999 });
  const article = buildPowerArticles(data)[1];
  assert.match(article.conteudo, /Queimadura/); assert.match(article.conteudo, /0,0001%/); assert.match(article.conteudo, /4% da vida máxima/);
  assert.match(article.conteudo, /-20%/); assert.match(article.conteudo, /0,1%/); assert.match(article.conteudo, /vida abaixo de 30%/); assert.match(article.conteudo, /Modos permitidos \| Aventura/); assert.doesNotMatch(article.conteudo, /999/);
});
test("Progression guide reuses real engine curves and fragment name", () => {
  const article = progressionGuide(); assert.match(article.conteudo, /Fragmento de Alma/); assert.match(article.conteudo, /10 \| 2,3× \| 0,7× \| Nível máximo/); assert.match(article.conteudo, /até 5 habilidades/);
});

test("Nature skills explain their magical evolution gate and its class requirements", () => {
  const data = fixture(); data.classBindings = [];
  data.natureBindings = [{ id_poder: 1, natureza_magica: "Fogo", nivel_aprendizagem: 10, custo_ouro: 100 }];
  data.magicEvolutions = [{ id: 10, id_classe: 1, natureza_magica: "Fogo", nome: "Chama ancestral", id_power_concedido: 1, nivel_necessario: 25, custo: 800 }];
  const article = buildPowerArticles(data)[1];
  assert.match(article.conteudo, /Natureza mágica Fogo: nível 10/);
  assert.match(article.conteudo, /adquira essa evolução primeiro/);
  assert.match(article.conteudo, /Chama ancestral \(Mago, natureza Fogo\), nível 25, 800/);
});
