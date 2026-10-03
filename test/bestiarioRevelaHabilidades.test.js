// IA de Combate PvE & Habilidades de Monstros V1 (§10.2) — Bestiário
// revela a lista de habilidades (nome/tipo/descrição da Power, nunca os
// números internos) de um monstro JÁ DESCOBERTO. Mesma regra de nome/
// imagem/drops: nada aparece antes da primeira vitória.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sequelize } = require("./helpers/db");
const bestiaryService = require("../src/services/bestiaryService");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const AdventureMonster = require("../src/models/AdventureMonster");
const MonsterAbility = require("../src/models/MonsterAbility");
const CharacterMonsterKill = require("../src/models/CharacterMonsterKill");
const Power = require("../src/models/Power");

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

testeComBanco("obterRegiao revela habilidades de monstro descoberto, mas nunca de monstro não descoberto", async () => {
  const { personagem } = await criarPersonagem({ nivel: 5 });
  const zona = await AdventureZone.findOne({ where: { nome: "Campos dos Viajantes" } });
  assert.ok(zona, "área 'Campos dos Viajantes' não encontrada — migrations da expansão rodaram?");

  const vinculos = await AdventureZoneMonster.findAll({
    where: { id_area: zona.id, ativo: true },
    include: [{ model: AdventureMonster, as: "monstro", where: { ativo: true }, required: true }],
  });
  assert.ok(vinculos.length >= 2, "esperava pelo menos 2 monstros vinculados em Campos dos Viajantes");
  const [monstroDescoberto, monstroNaoDescoberto] = vinculos.map((v) => v.monstro);

  const power = await Power.create({
    nome: `Power Bestiário Teste ${Date.now()}`,
    descricao: "golpe sombrio",
    tipo_poder: "Ativo",
    escala_atributo: "Forca",
    usage_scope: "MONSTER",
    dano_base: 30,
  });
  await MonsterAbility.create({ id_monstro: monstroDescoberto.id, id_power: power.id });
  await MonsterAbility.create({ id_monstro: monstroNaoDescoberto.id, id_power: power.id });

  await CharacterMonsterKill.create({
    id_personagem: personagem.id,
    nome_monstro: monstroDescoberto.nome,
    quantidade: 1,
    primeira_derrota_em: new Date(),
  });

  const ficha = await bestiaryService.obterRegiao(personagem.id, zona.id);
  const cardDescoberto = ficha.monstros.find((m) => m.nome === monstroDescoberto.nome);
  assert.ok(cardDescoberto, "monstro recém-descoberto deveria aparecer na ficha");
  assert.ok(cardDescoberto.habilidades.some((h) => h.nome === power.nome), "habilidade deveria aparecer pro monstro descoberto");
  assert.equal(cardDescoberto.habilidades[0].tipo_poder, "Ativo");

  const cardNaoDescoberto = ficha.monstros.find((m) => m.nome === monstroNaoDescoberto.nome);
  assert.equal(cardNaoDescoberto, undefined, "monstro não descoberto não deveria sequer aparecer no array (mistério do Bestiário)");

  await MonsterAbility.destroy({ where: { id_power: power.id } });
  await CharacterMonsterKill.destroy({ where: { id_personagem: personagem.id, nome_monstro: monstroDescoberto.nome } });
  await power.destroy();
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
