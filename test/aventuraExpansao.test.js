// Expansão Aventura Beta — testes de conteúdo (§51), loot (§52),
// compatibilidade (§53) e balanceamento (§55) da especificação.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sequelize } = require("./helpers/db");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureMonsterLoot = require("../src/models/AdventureMonsterLoot");
const Item = require("../src/models/Item");
require("../src/models/associations");
const { sortearEspoliosDoMonstro } = require("../src/services/adventureRewardService");
const { MONSTROS } = require("../src/config/adventureExpansionData");

// A tabela AdventureMonsters é COMPARTILHADA com outros arquivos de
// teste (ex.: characterProfile.test.js cria monstros descartáveis
// próprios) — nunca assumir que os únicos monstros ativos no banco são
// os 40 da expansão; sempre filtrar pelos nomes conhecidos dela.
const NOMES_DOS_40 = MONSTROS.map((m) => m.nome);

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

// ---------------------------------------------------------------------
// §51 — testes de conteúdo/estrutura
// ---------------------------------------------------------------------

testeComBanco("exatamente 10 áreas ativas, em ordem 1..10, sem lacunas de nível", async () => {
  const zonas = await AdventureZone.findAll({ where: { ativa: true }, order: [["ordem", "ASC"]] });
  assert.equal(zonas.length, 10);
  zonas.forEach((z, i) => assert.equal(z.ordem, i + 1));

  assert.equal(zonas[0].nivel_monstro_min, 1);
  assert.equal(zonas[zonas.length - 1].nivel_monstro_max, 50);
  for (let i = 1; i < zonas.length; i++) {
    assert.equal(zonas[i].nivel_monstro_min, zonas[i - 1].nivel_monstro_max + 1, `lacuna entre ${zonas[i - 1].nome} e ${zonas[i].nome}`);
  }
});

testeComBanco("cada área tem exatamente 4 vínculos ativos: 3 Comuns + 1 Raro, pesos somando 1000", async () => {
  const zonas = await AdventureZone.findAll({ where: { ativa: true } });
  for (const zona of zonas) {
    const vinculos = await AdventureZoneMonster.findAll({ where: { id_area: zona.id, ativo: true } });
    assert.equal(vinculos.length, 4, `área ${zona.nome} não tem 4 vínculos ativos`);

    const comuns = vinculos.filter((v) => v.tipo_aparicao === "Comum");
    const raros = vinculos.filter((v) => v.tipo_aparicao === "Raro");
    assert.equal(comuns.length, 3, `área ${zona.nome} não tem 3 Comuns`);
    assert.equal(raros.length, 1, `área ${zona.nome} não tem 1 Raro`);
    assert.equal(raros[0].peso_aparicao, 40, `Raro de ${zona.nome} não tem peso 40`);

    const somaPesos = vinculos.reduce((s, v) => s + v.peso_aparicao, 0);
    assert.equal(somaPesos, 1000, `soma dos pesos de ${zona.nome} não é 1000`);

    const raro = raros[0];
    const minEfetivo = raro.nivel_min_override ?? zona.nivel_monstro_min;
    const maxEfetivo = raro.nivel_max_override ?? zona.nivel_monstro_max;
    assert.ok(minEfetivo >= zona.nivel_monstro_min && maxEfetivo <= zona.nivel_monstro_max, `override do Raro de ${zona.nome} fora da faixa da área`);
  }
});

testeComBanco("todos os monstros ativos têm descrição e multiplicadores positivos", async () => {
  const monstros = await AdventureMonster.findAll({ where: { ativo: true, nome: NOMES_DOS_40 } });
  assert.equal(monstros.length, 40);
  for (const m of monstros) {
    assert.ok(m.descricao && m.descricao.length > 0, `${m.nome} sem descrição`);
    assert.ok(m.multiplicador_vida > 0, `${m.nome} com multiplicador_vida inválido`);
    assert.ok(m.multiplicador_dano > 0, `${m.nome} com multiplicador_dano inválido`);
    assert.ok(m.multiplicador_agilidade > 0, `${m.nome} com multiplicador_agilidade inválido`);
    assert.ok(m.multiplicador_velocidade > 0, `${m.nome} com multiplicador_velocidade inválido`);
  }
});

testeComBanco("todo AdventureMonsterLoot aponta pra um Item válido do tipo Espólio", async () => {
  const loots = await AdventureMonsterLoot.findAll({ include: [{ model: Item, as: "item" }] });
  assert.ok(loots.length > 0);
  for (const l of loots) {
    assert.ok(l.item, `loot ${l.id} aponta pra item inexistente`);
    assert.equal(l.item.tipo_item, "Espolio");
  }
});

testeComBanco("cada monstro Comum tem 2 entradas de loot (Principal+Secundário); Raro tem 3", async () => {
  const monstros = await AdventureMonster.findAll({ where: { ativo: true } });
  const vinculos = await AdventureZoneMonster.findAll({ where: { ativo: true } });
  const tipoPorMonstro = new Map(vinculos.map((v) => [v.id_monstro, v.tipo_aparicao]));

  for (const m of monstros) {
    const tipo = tipoPorMonstro.get(m.id);
    if (!tipo) continue; // monstro sem vínculo ativo — não esperado, mas não é o foco deste teste.
    const loots = await AdventureMonsterLoot.findAll({ where: { id_monstro: m.id } });
    const esperado = tipo === "Raro" ? 3 : 2;
    assert.equal(loots.length, esperado, `${m.nome} (${tipo}) tem ${loots.length} entradas de loot, esperado ${esperado}`);
  }
});

// ---------------------------------------------------------------------
// §52 — testes de loot (rolagem real via adventureRewardService)
// ---------------------------------------------------------------------

testeComBanco("Lobo das Sombras nunca dropa Teia de Aranha Venenosa (drop cruzado entre monstros da mesma área)", async () => {
  const lobo = await AdventureMonster.findOne({ where: { nome: "Lobo das Sombras" } });
  for (let i = 0; i < 30; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const espolios = await sortearEspoliosDoMonstro(lobo.id);
    assert.ok(
      espolios.every((e) => e.nome !== "Teia de Aranha Venenosa"),
      "Lobo das Sombras dropou item de outro monstro da mesma área",
    );
  }
});

testeComBanco("Raro com Principal chance 100% sempre concede esse espólio", async () => {
  const golem = await AdventureMonster.findOne({ where: { nome: "Golem de Pedra" } });
  const principal = await AdventureMonsterLoot.findOne({
    where: { id_monstro: golem.id, categoria: "Principal" },
    include: [{ model: Item, as: "item" }],
  });
  assert.equal(principal.chance_ppm, 1_000_000);

  for (let i = 0; i < 15; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const espolios = await sortearEspoliosDoMonstro(golem.id);
    assert.ok(espolios.some((e) => e.nome === principal.item.nome), "drop Principal (100%) do Raro não caiu numa rolagem");
  }
});

testeComBanco("quantidade concedida sempre respeita quantidade_min/quantidade_max da entrada", async () => {
  const minotauro = await AdventureMonster.findOne({ where: { nome: "Minotauro" } });
  const entradas = await AdventureMonsterLoot.findAll({ where: { id_monstro: minotauro.id } });
  const porItemId = new Map(entradas.map((e) => [e.id_item, e]));

  for (let i = 0; i < 15; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const espolios = await sortearEspoliosDoMonstro(minotauro.id);
    for (const espolio of espolios) {
      const entrada = porItemId.get(espolio.id_item);
      assert.ok(espolio.quantidade >= entrada.quantidade_min && espolio.quantidade <= entrada.quantidade_max);
    }
  }
});

testeComBanco("Raro pode entregar mais de um espólio na mesma vitória (rolagem independente, não exclusiva)", async () => {
  const minotauro = await AdventureMonster.findOne({ where: { nome: "Minotauro" } });
  let algumaVezMaisDeUm = false;
  for (let i = 0; i < 40; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const espolios = await sortearEspoliosDoMonstro(minotauro.id);
    if (espolios.length > 1) {
      algumaVezMaisDeUm = true;
      break;
    }
  }
  assert.ok(algumaVezMaisDeUm, "em 40 tentativas, nunca caiu mais de 1 espólio — rolagem parece exclusiva, não independente");
});

// ---------------------------------------------------------------------
// §55 — balanceamento básico
// ---------------------------------------------------------------------

testeComBanco("Raro é mais perigoso que os Comuns da mesma área (vida e dano maiores)", async () => {
  const zonas = await AdventureZone.findAll({ where: { ativa: true } });
  for (const zona of zonas) {
    const vinculos = await AdventureZoneMonster.findAll({
      where: { id_area: zona.id, ativo: true },
      include: [{ model: AdventureMonster, as: "monstro" }],
    });
    const raro = vinculos.find((v) => v.tipo_aparicao === "Raro").monstro;
    const comuns = vinculos.filter((v) => v.tipo_aparicao === "Comum").map((v) => v.monstro);
    const mediaVidaComum = comuns.reduce((s, m) => s + m.multiplicador_vida, 0) / comuns.length;
    const mediaDanoComum = comuns.reduce((s, m) => s + m.multiplicador_dano, 0) / comuns.length;

    assert.ok(raro.multiplicador_vida > mediaVidaComum, `Raro de ${zona.nome} não tem mais vida que a média dos Comuns`);
    assert.ok(raro.multiplicador_dano > mediaDanoComum, `Raro de ${zona.nome} não tem mais dano que a média dos Comuns`);
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});
