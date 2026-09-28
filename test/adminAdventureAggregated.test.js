// Especificação "Admin de Aventura + Defesa/Poder de Monstros" v3 §2.4/
// §4.2/§7.3/§12.3 — endpoints agregados (sincronizarRosterZona,
// sincronizarLootMonstro, getAdminMonsterDetail) que o novo ZoneEditor/
// MonsterEditor usam pra salvar tudo de uma vez em vez de um PATCH por
// linha. Mesmo padrão de fixture isolada de adminAdventureValidation.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const AdventureMonster = require("../src/models/AdventureMonster");
const AdventureZone = require("../src/models/AdventureZone");
const AdventureZoneMonster = require("../src/models/AdventureZoneMonster");
const AdventureMonsterLoot = require("../src/models/AdventureMonsterLoot");
const Item = require("../src/models/Item");

const adminAdventureService = require("../src/services/adminAdventureService");

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

const ADMIN_FAKE = { idAdmin: 1, req: { ip: "127.0.0.1", headers: {}, get: () => "teste-agent" } };

const zonasCriadas = [];
const monstrosCriados = [];
const itensCriados = [];

async function criarZonaDeTeste() {
  const zona = await AdventureZone.create({
    nome: `Zona Agregada Teste ${sufixo()}`,
    nivel_monstro_min: 1,
    nivel_monstro_max: 99,
    ordem: 999,
    ativa: true,
  });
  zonasCriadas.push(zona.id);
  return zona;
}

async function criarMonstroDeTeste(overrides = {}) {
  const monstro = await AdventureMonster.create({
    nome: `Monstro Agregado Teste ${sufixo()}`,
    nivel: 1,
    vida_maxima: 50,
    dano_min: 1,
    dano_max: 3,
    agilidade: 1,
    velocidade: 1,
    xp_recompensa: 1,
    ouro_recompensa: 1,
    ativo: true,
    ...overrides,
  });
  monstrosCriados.push(monstro.id);
  return monstro;
}

async function criarItemDeTeste() {
  const item = await Item.create({
    nome: `Item Agregado Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Espolio",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

test.after(async () => {
  if (!temBanco) return;
  await AdventureMonsterLoot.destroy({ where: { id_monstro: monstrosCriados.length ? monstrosCriados : [-1] } });
  await AdventureZoneMonster.destroy({ where: { id_area: zonasCriadas.length ? zonasCriadas : [-1] } });
  await AdventureZone.destroy({ where: { id: zonasCriadas.length ? zonasCriadas : [-1] } });
  await AdventureMonster.destroy({ where: { id: monstrosCriados.length ? monstrosCriados : [-1] } });
  await Item.destroy({ where: { id: itensCriados.length ? itensCriados : [-1] } });
});

// ---------------------------------------------------------- ROSTER DE ZONA

testeComBanco("sincronizarRosterZona: cria vínculos novos", async () => {
  const zona = await criarZonaDeTeste();
  const m1 = await criarMonstroDeTeste();
  const m2 = await criarMonstroDeTeste();

  const roster = await adminAdventureService.sincronizarRosterZona(
    zona.id,
    [
      { id_monstro: m1.id, peso_aparicao: 300, tipo_aparicao: "Comum" },
      { id_monstro: m2.id, peso_aparicao: 50, tipo_aparicao: "Raro" },
    ],
    ADMIN_FAKE,
  );

  assert.equal(roster.length, 2);
  const vinculos = await AdventureZoneMonster.findAll({ where: { id_area: zona.id } });
  assert.equal(vinculos.length, 2);
});

testeComBanco("sincronizarRosterZona: atualiza vínculo existente e desativa o que sumiu do payload", async () => {
  const zona = await criarZonaDeTeste();
  const m1 = await criarMonstroDeTeste();
  const m2 = await criarMonstroDeTeste();

  await adminAdventureService.sincronizarRosterZona(
    zona.id,
    [
      { id_monstro: m1.id, peso_aparicao: 100, tipo_aparicao: "Comum" },
      { id_monstro: m2.id, peso_aparicao: 100, tipo_aparicao: "Comum" },
    ],
    ADMIN_FAKE,
  );

  // Segunda sincronização: m1 muda de peso, m2 sai do payload — precisa
  // virar ativo=false, NUNCA ser deletado (§2.4 passo 5).
  await adminAdventureService.sincronizarRosterZona(
    zona.id,
    [{ id_monstro: m1.id, peso_aparicao: 999, tipo_aparicao: "Raro" }],
    ADMIN_FAKE,
  );

  const linhaM1 = await AdventureZoneMonster.findOne({ where: { id_area: zona.id, id_monstro: m1.id } });
  assert.equal(linhaM1.peso_aparicao, 999);
  assert.equal(linhaM1.tipo_aparicao, "Raro");
  assert.equal(linhaM1.ativo, true);

  const linhaM2 = await AdventureZoneMonster.findOne({ where: { id_area: zona.id, id_monstro: m2.id } });
  assert.ok(linhaM2, "vínculo do m2 não pode ser deletado, só desativado");
  assert.equal(linhaM2.ativo, false);
});

testeComBanco("sincronizarRosterZona: readicionar monstro previamente inativo REATIVA a linha existente (não cria segunda)", async () => {
  const zona = await criarZonaDeTeste();
  const m1 = await criarMonstroDeTeste();

  await adminAdventureService.sincronizarRosterZona(zona.id, [{ id_monstro: m1.id, peso_aparicao: 100 }], ADMIN_FAKE);
  await adminAdventureService.sincronizarRosterZona(zona.id, [], ADMIN_FAKE); // desativa
  const inativo = await AdventureZoneMonster.findOne({ where: { id_area: zona.id, id_monstro: m1.id } });
  assert.equal(inativo.ativo, false);

  await adminAdventureService.sincronizarRosterZona(zona.id, [{ id_monstro: m1.id, peso_aparicao: 200 }], ADMIN_FAKE);

  const linhas = await AdventureZoneMonster.findAll({ where: { id_area: zona.id, id_monstro: m1.id } });
  assert.equal(linhas.length, 1, "readicionar precisa reaproveitar a linha existente, não criar outra (unique constraint)");
  assert.equal(linhas[0].ativo, true);
  assert.equal(linhas[0].peso_aparicao, 200);
});

testeComBanco("sincronizarRosterZona: payload inválido (peso <= 0) não deixa write parcial", async () => {
  const zona = await criarZonaDeTeste();
  const m1 = await criarMonstroDeTeste();
  const m2 = await criarMonstroDeTeste();

  await assert.rejects(() =>
    adminAdventureService.sincronizarRosterZona(
      zona.id,
      [
        { id_monstro: m1.id, peso_aparicao: 100 },
        { id_monstro: m2.id, peso_aparicao: 0 }, // inválido
      ],
      ADMIN_FAKE,
    ),
  );

  const vinculos = await AdventureZoneMonster.findAll({ where: { id_area: zona.id } });
  assert.equal(vinculos.length, 0, "nenhuma linha devia ter sido criada — a validação roda ANTES da transaction");
});

testeComBanco("sincronizarRosterZona: monstro inexistente no payload é rejeitado", async () => {
  const zona = await criarZonaDeTeste();
  await assert.rejects(
    () => adminAdventureService.sincronizarRosterZona(zona.id, [{ id_monstro: 999999999, peso_aparicao: 100 }], ADMIN_FAKE),
    /monstro.*não existe/i,
  );
});

testeComBanco("sincronizarRosterZona: zona inexistente é rejeitada", async () => {
  await assert.rejects(
    () => adminAdventureService.sincronizarRosterZona(999999999, [], ADMIN_FAKE),
    /zona.*não encontrada/i,
  );
});

// ------------------------------------------------------------- LOOT AGREGADO

testeComBanco("sincronizarLootMonstro: cria drops novos", async () => {
  const monstro = await criarMonstroDeTeste();
  const item1 = await criarItemDeTeste();
  const item2 = await criarItemDeTeste();

  const loot = await adminAdventureService.sincronizarLootMonstro(
    monstro.id,
    [
      { id_item: item1.id, chance_ppm: 500000, categoria: "Principal" },
      { id_item: item2.id, chance_ppm: 100000, categoria: "Secundario" },
    ],
    ADMIN_FAKE,
  );

  assert.equal(loot.length, 2);
});

testeComBanco("sincronizarLootMonstro: atualiza por id e desativa ausente do payload (nunca deleta)", async () => {
  const monstro = await criarMonstroDeTeste();
  const item1 = await criarItemDeTeste();
  const item2 = await criarItemDeTeste();

  const primeira = await adminAdventureService.sincronizarLootMonstro(
    monstro.id,
    [
      { id_item: item1.id, chance_ppm: 500000 },
      { id_item: item2.id, chance_ppm: 100000 },
    ],
    ADMIN_FAKE,
  );
  const idLinha1 = primeira.find((l) => l.id_item === item1.id).id;

  await adminAdventureService.sincronizarLootMonstro(
    monstro.id,
    [{ id: idLinha1, id_item: item1.id, chance_ppm: 999999 }],
    ADMIN_FAKE,
  );

  const linha1 = await AdventureMonsterLoot.findByPk(idLinha1);
  assert.equal(linha1.chance_ppm, 999999);
  assert.equal(linha1.ativo, true);

  const todasAsLinhas = await AdventureMonsterLoot.findAll({ where: { id_monstro: monstro.id } });
  assert.equal(todasAsLinhas.length, 2, "linha do item2 não pode ser deletada");
  const linha2 = todasAsLinhas.find((l) => l.id_item === item2.id);
  assert.equal(linha2.ativo, false);
});

testeComBanco("sincronizarLootMonstro: chance_ppm fora de 1..1.000.000 é rejeitado sem write parcial", async () => {
  const monstro = await criarMonstroDeTeste();
  const item1 = await criarItemDeTeste();

  await assert.rejects(() =>
    adminAdventureService.sincronizarLootMonstro(monstro.id, [{ id_item: item1.id, chance_ppm: 2000000 }], ADMIN_FAKE),
  );
  const linhas = await AdventureMonsterLoot.findAll({ where: { id_monstro: monstro.id } });
  assert.equal(linhas.length, 0);
});

testeComBanco("sincronizarLootMonstro: quantidade_min > quantidade_max é rejeitado", async () => {
  const monstro = await criarMonstroDeTeste();
  const item1 = await criarItemDeTeste();

  await assert.rejects(() =>
    adminAdventureService.sincronizarLootMonstro(
      monstro.id,
      [{ id_item: item1.id, chance_ppm: 500000, quantidade_min: 5, quantidade_max: 1 }],
      ADMIN_FAKE,
    ),
  );
});

testeComBanco("sincronizarLootMonstro: id de outro monstro é rejeitado (nunca sequestra linha de outro)", async () => {
  const monstroA = await criarMonstroDeTeste();
  const monstroB = await criarMonstroDeTeste();
  const item1 = await criarItemDeTeste();

  const lootA = await adminAdventureService.sincronizarLootMonstro(
    monstroA.id,
    [{ id_item: item1.id, chance_ppm: 500000 }],
    ADMIN_FAKE,
  );
  const idDaLinhaDoA = lootA[0].id;

  await assert.rejects(
    () =>
      adminAdventureService.sincronizarLootMonstro(
        monstroB.id,
        [{ id: idDaLinhaDoA, id_item: item1.id, chance_ppm: 1 }],
        ADMIN_FAKE,
      ),
    /não pertence a este monstro/i,
  );
});

// ------------------------------------------------------------- DETALHE (§7.3)

testeComBanco("getAdminMonsterDetail: agrega stats + Poder + drops + zonas", async () => {
  const zona = await criarZonaDeTeste();
  const monstro = await criarMonstroDeTeste({ defesa: 10, vida_maxima: 100, dano_min: 5, dano_max: 10 });
  const item = await criarItemDeTeste();

  await adminAdventureService.sincronizarRosterZona(zona.id, [{ id_monstro: monstro.id, peso_aparicao: 100 }], ADMIN_FAKE);
  await adminAdventureService.sincronizarLootMonstro(monstro.id, [{ id_item: item.id, chance_ppm: 500000 }], ADMIN_FAKE);

  const detalhe = await adminAdventureService.getAdminMonsterDetail(monstro.id);

  assert.equal(detalhe.monstro.id, monstro.id);
  assert.ok(detalhe.combat_power.combatPower > 0);
  assert.equal(detalhe.combat_power.version, 2);
  assert.equal(detalhe.loot.length, 1);
  assert.equal(detalhe.zonas.length, 1);
  assert.equal(detalhe.zonas[0].id_area, zona.id);
});

testeComBanco("getAdminMonsterDetail: monstro inexistente é rejeitado", async () => {
  await assert.rejects(() => adminAdventureService.getAdminMonsterDetail(999999999), /não encontrado/i);
});

// ------------------------------------------------------- LISTAGEM COM PODER

testeComBanco("listAdminMonsters: cada linha carrega combat_power calculado, nunca fixo", async () => {
  const fraco = await criarMonstroDeTeste({ vida_maxima: 10, dano_min: 1, dano_max: 1, defesa: 0 });
  const forte = await criarMonstroDeTeste({ vida_maxima: 500, dano_min: 50, dano_max: 50, defesa: 40 });

  const lista = await adminAdventureService.listAdminMonsters();
  const linhaFraco = lista.find((m) => m.id === fraco.id);
  const linhaForte = lista.find((m) => m.id === forte.id);

  assert.ok(linhaFraco.combat_power > 0);
  assert.ok(linhaForte.combat_power > linhaFraco.combat_power);
});
