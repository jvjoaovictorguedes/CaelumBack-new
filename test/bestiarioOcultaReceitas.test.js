// Bestiário — relato do jogador: itens do tipo "Receita" (a fórmula
// física que se aprende ao usar, ver alchemyLearnService.js/
// forgeRecipeService.js) apareciam na lista de "Drops ao derrotar" de
// um monstro já descoberto. A ficha do Bestiário é só pra loot de
// equipamento/material/consumível — ver bestiaryService.js
// (obterRegiao), que agora filtra Item.tipo_item === "Receita" do
// include do loot.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const bestiaryService = require("../src/services/bestiaryService");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureMonsterLoot = require("../src/models/AdventureMonsterLoot");
const CharacterMonsterKill = require("../src/models/CharacterMonsterKill");
const Item = require("../src/models/Item");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

testeComBanco("obterRegiao nunca lista item tipo Receita entre os drops de um monstro descoberto", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

  const vinculo = await AdventureZoneMonster.findOne({
    where: { id_area: zona.id, ativo: true },
    include: [{ model: AdventureMonster, as: "monstro", where: { ativo: true }, required: true }],
  });
  assert.ok(vinculo, "esperava ao menos um monstro vinculado em Campos dos Viajantes");
  const monstro = vinculo.monstro;

  const material = await Item.create({
    nome: `Material de Teste Bestiário ${Date.now()}`,
    descricao: "item de teste",
    tipo_item: "Material",
    raridade: "Comum",
  });
  const receita = await Item.create({
    nome: `Receita de Teste Bestiário ${Date.now()}`,
    descricao: "item de teste",
    tipo_item: "Receita",
    raridade: "Comum",
  });

  await AdventureMonsterLoot.create({
    id_monstro: monstro.id,
    id_item: material.id,
    chance_ppm: 500000,
    quantidade_min: 1,
    quantidade_max: 1,
    categoria: "Principal",
  });
  await AdventureMonsterLoot.create({
    id_monstro: monstro.id,
    id_item: receita.id,
    chance_ppm: 100000,
    quantidade_min: 1,
    quantidade_max: 1,
    categoria: "Especial",
  });

  await CharacterMonsterKill.create({
    id_personagem: personagem.id,
    nome_monstro: monstro.nome,
    quantidade: 1,
    primeira_derrota_em: new Date(),
  });

  const ficha = await bestiaryService.obterRegiao(personagem.id, zona.id);
  const ficheMonstro = ficha.monstros.find((m) => m.nome === monstro.nome);
  assert.ok(ficheMonstro, "monstro recém-descoberto deveria aparecer na ficha");

  const nomesDrops = ficheMonstro.drops.map((d) => d.nome);
  assert.ok(nomesDrops.includes(material.nome), "drop de Material deve continuar aparecendo normalmente");
  assert.ok(!nomesDrops.includes(receita.nome), "drop do tipo Receita nunca pode aparecer na ficha do Bestiário");

  // Limpa o que este teste criou — outros testes (aventuraExpansao.test.js)
  // checam invariantes globais da tabela AdventureMonsterLoot (ex.: todo
  // loot aponta pra Item do tipo Espólio) e quebrariam com estas linhas
  // de teste sobrando no banco compartilhado.
  await AdventureMonsterLoot.destroy({ where: { id_item: [material.id, receita.id] } });
  await CharacterMonsterKill.destroy({ where: { id_personagem: personagem.id, nome_monstro: monstro.nome } });
  await material.destroy();
  await receita.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
