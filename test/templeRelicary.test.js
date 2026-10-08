// Templo do Véu Celestial — Fase 4: Relicário dos Ecos (§6/§7/§14.1/
// §14.2). Mesmo padrão de infra de templeObjective.test.js: constrói o
// config_snapshot.relicary diretamente (sem passar pelo Admin, que é
// Fase 8), igual templeObjective.test.js faz com config_snapshot.missions.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const TempleEvent = require("../src/models/TempleEvent");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const CharacterTempleDrawState = require("../src/models/CharacterTempleDrawState");
const TempleDrawHistory = require("../src/models/TempleDrawHistory");
const templeRelicaryService = require("../src/services/templeRelicaryService");
const { EVENT_STATUS } = require("../src/config/templeConfig");

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

const itensCriados = [];
const eventosCriados = [];

async function criarItem(overrides = {}) {
  const item = await Item.create({
    nome: `Item Teste ${sufixo()}`,
    descricao: "Item de teste do Relicário",
    tipo_item: "Material",
    raridade: "Comum",
    disponivel_loja: false,
    negociavel_mercado: false,
    ...overrides,
  });
  itensCriados.push(item.id);
  return item;
}

function entrada(overrides) {
  return {
    key: `entrada_${sufixo()}`,
    reward_kind: "STACKABLE_ITEM",
    id_item: null,
    quantidade: 1,
    raridade_instancia: null,
    weight: 1,
    eh_raro_mais: false,
    eh_featured: false,
    eh_unico: false,
    fallback_key: null,
    nome_exibicao: "Entrada de teste",
    ...overrides,
  };
}

async function criarEventoAtivo({ entries, custoSigilosDraw = 1, pityRaro = null, pityFeatured = null } = {}) {
  const itemSigilo = await criarItem({ tipo_item: "Currencia", raridade: "Epico" });
  const evento = await TempleEvent.create({
    key: `convergencia_${sufixo()}`,
    nome: "Vigília do Eclipse",
    status: EVENT_STATUS.ACTIVE,
    id_currency_item: itemSigilo.id,
    config_snapshot: {
      schema_version: 1,
      nome: "Vigília do Eclipse",
      id_currency_item: itemSigilo.id,
      missions: [],
      relicary: entries
        ? {
            pool_id: 1,
            nome: "Relicário de teste",
            custo_sigilos_draw: custoSigilosDraw,
            pity_raro_mais_garantia: pityRaro,
            pity_featured_garantia: pityFeatured,
            entries,
          }
        : null,
      boss: null,
    },
  });
  eventosCriados.push(evento.id);
  return { evento, itemSigilo };
}

async function concederSigilos(characterId, idItem, quantidade) {
  await CharacterInventory.create({ id_personagem: characterId, id_item: idItem, quantidade });
}

test.afterEach(async () => {
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
    await TempleEvent.destroy({ where: { id: eventosCriados } });
    eventosCriados.length = 0;
  }
  if (itensCriados.length > 0) {
    await CharacterInventory.destroy({ where: { id_item: itensCriados } });
    await CharacterEquipmentInstance.destroy({ where: { id_item: itensCriados } });
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

testeComBanco("sortear 1x debita exatamente o custo e grava histórico", async () => {
  const { personagem } = await criarPersonagem({});
  const itemRecompensa = await criarItem();
  const { evento, itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 5,
    entries: [entrada({ key: "unica", id_item: itemRecompensa.id, quantidade: 3, weight: 1 })],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 100);

  const resultado = await sequelize.transaction((t) =>
    templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
  );

  assert.equal(resultado.idempotente, false);
  assert.equal(resultado.draws.length, 1);
  assert.equal(resultado.draws[0].entry_key, "unica");
  assert.equal(resultado.draws[0].quantidade, 3);

  const saldoSigilos = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemSigilo.id } });
  assert.equal(saldoSigilos.quantidade, 95, "deve debitar exatamente o custo (5)");

  const estoqueRecompensa = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: itemRecompensa.id },
  });
  assert.equal(estoqueRecompensa.quantidade, 3);

  const historico = await TempleDrawHistory.findAll({ where: { character_id: personagem.id, id_event: evento.id } });
  assert.equal(historico.length, 1);
  assert.equal(historico[0].draw_seq, 1);
});

testeComBanco("sortear 10x debita exatamente 10x o custo de um draw", async () => {
  const { personagem } = await criarPersonagem({});
  const itemRecompensa = await criarItem();
  const { itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 3,
    entries: [entrada({ key: "unica", id_item: itemRecompensa.id, weight: 1 })],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 100);

  const resultado = await sequelize.transaction((t) =>
    templeRelicaryService.sortear(personagem.id, { count: 10, clientRequestId: `req-${sufixo()}` }, t),
  );

  assert.equal(resultado.draws.length, 10);
  const saldoSigilos = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemSigilo.id } });
  assert.equal(saldoSigilos.quantidade, 70, "10 draws de custo 3 = 30 debitados");

  const estado = await CharacterTempleDrawState.findOne({ where: { character_id: personagem.id } });
  assert.equal(estado.total_draws >= 10, true);
});

testeComBanco("pity Raro+ força a entry marcada eh_raro_mais quando a garantia é atingida", async () => {
  const { personagem } = await criarPersonagem({});
  const itemComum = await criarItem();
  const itemRaro = await criarItem();
  const { itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 1,
    pityRaro: 3,
    entries: [
      entrada({ key: "comum", id_item: itemComum.id, weight: 1000, eh_raro_mais: false }),
      entrada({ key: "raro", id_item: itemRaro.id, weight: 1, eh_raro_mais: true }),
    ],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 1000);

  let ultimoResultado;
  for (let i = 0; i < 3; i++) {
    ultimoResultado = await sequelize.transaction((t) =>
      templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
    );
  }

  assert.equal(ultimoResultado.draws[0].entry_key, "raro", "3º draw deve ser forçado pela garantia de pity Raro+");

  const estado = await CharacterTempleDrawState.findOne({ where: { character_id: personagem.id } });
  assert.equal(estado.draws_desde_raro_mais, 0, "contador deve resetar após conceder a garantia");
});

testeComBanco("entry eh_unico já possuída usa fallback_key em vez de duplicar", async () => {
  const { personagem } = await criarPersonagem({});
  const itemUnico = await criarItem();
  const itemFallback = await criarItem();
  const { itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 1,
    entries: [
      entrada({ key: "unico", id_item: itemUnico.id, weight: 1, eh_unico: true, fallback_key: "fallback" }),
      entrada({ key: "fallback", id_item: itemFallback.id, weight: 0 }),
    ],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 100);
  // Personagem já possui o item único — o próximo draw deve substituir
  // pelo fallback em vez de repetir a recompensa única.
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemUnico.id, quantidade: 1 });

  const resultado = await sequelize.transaction((t) =>
    templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
  );

  assert.equal(resultado.draws[0].entry_key, "fallback");
  assert.equal(resultado.draws[0].eh_fallback, true);

  const historico = await TempleDrawHistory.findOne({ where: { character_id: personagem.id, entry_key: "fallback" } });
  assert.equal(historico.original_entry_key, "unico");
  // Pity Raro+/Featured contam pela entry ORIGINAL — "unico" não marca
  // nenhuma das duas aqui, então isso só confirma que não lançou erro.
});

testeComBanco("retry com o mesmo client_request_id é idempotente e nunca debita duas vezes", async () => {
  const { personagem } = await criarPersonagem({});
  const itemRecompensa = await criarItem();
  const { itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 7,
    entries: [entrada({ key: "unica", id_item: itemRecompensa.id, weight: 1 })],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 100);
  const clientRequestId = `req-fixo-${sufixo()}`;

  const primeiro = await sequelize.transaction((t) =>
    templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId }, t),
  );
  const segundo = await sequelize.transaction((t) =>
    templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId }, t),
  );

  assert.equal(primeiro.idempotente, false);
  assert.equal(segundo.idempotente, true);
  assert.deepEqual(segundo.draws.map((d) => d.entry_key), primeiro.draws.map((d) => d.entry_key));

  const saldoSigilos = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: itemSigilo.id } });
  assert.equal(saldoSigilos.quantidade, 93, "só deve debitar uma vez (100 - 7)");
});

testeComBanco("count diferente de 1 ou 10 é rejeitado", async () => {
  const { personagem } = await criarPersonagem({});
  await assert.rejects(
    () =>
      sequelize.transaction((t) =>
        templeRelicaryService.sortear(personagem.id, { count: 5, clientRequestId: `req-${sufixo()}` }, t),
      ),
    /deve ser 1 ou 10/,
  );
});

testeComBanco("client_request_id ausente é rejeitado", async () => {
  const { personagem } = await criarPersonagem({});
  await assert.rejects(
    () => sequelize.transaction((t) => templeRelicaryService.sortear(personagem.id, { count: 1 }, t)),
    /client_request_id é obrigatório/,
  );
});

testeComBanco("sem Convergência com Relicário aberto, rejeita", async () => {
  const { personagem } = await criarPersonagem({});
  await assert.rejects(
    () =>
      sequelize.transaction((t) =>
        templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
      ),
    /Não há Convergência/,
  );
});

testeComBanco("Convergência aberta sem relicary configurado no snapshot rejeita", async () => {
  const { personagem } = await criarPersonagem({});
  await criarEventoAtivo({ entries: null });

  await assert.rejects(
    () =>
      sequelize.transaction((t) =>
        templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
      ),
    /ainda não foi configurado/,
  );
});

testeComBanco("saldo insuficiente de Sigilos rejeita e não concede nenhuma recompensa", async () => {
  const { personagem } = await criarPersonagem({});
  const itemRecompensa = await criarItem();
  const { itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 50,
    entries: [entrada({ key: "unica", id_item: itemRecompensa.id, weight: 1 })],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 10);

  await assert.rejects(
    () =>
      sequelize.transaction((t) =>
        templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
      ),
    /insuficiente/,
  );

  const estoqueRecompensa = await CharacterInventory.findOne({
    where: { id_personagem: personagem.id, id_item: itemRecompensa.id },
  });
  assert.equal(estoqueRecompensa, null, "nenhuma recompensa deve ter sido concedida numa transaction que falhou");
});

testeComBanco("entry EQUIPMENT gera uma CharacterEquipmentInstance com a raridade configurada", async () => {
  const { personagem } = await criarPersonagem({});
  const itemArma = await criarItem({ tipo_item: "Arma" });
  const { itemSigilo } = await criarEventoAtivo({
    custoSigilosDraw: 1,
    entries: [
      entrada({
        key: "arma_lendaria",
        reward_kind: "EQUIPMENT",
        id_item: itemArma.id,
        raridade_instancia: "Lendario",
        weight: 1,
      }),
    ],
  });
  await concederSigilos(personagem.id, itemSigilo.id, 10);

  const resultado = await sequelize.transaction((t) =>
    templeRelicaryService.sortear(personagem.id, { count: 1, clientRequestId: `req-${sufixo()}` }, t),
  );

  assert.equal(resultado.draws[0].reward_kind, "EQUIPMENT");
  assert.equal(resultado.draws[0].raridade, "Lendario");

  const instancia = await CharacterEquipmentInstance.findOne({
    where: { id_personagem: personagem.id, id_item: itemArma.id },
  });
  assert.ok(instancia, "deve criar uma instância de equipamento real");
  assert.equal(instancia.raridade, "Lendario");
});

testeComBanco("obterRelicario exclui entries eh_unico já possuídas (odds após elegibilidade)", async () => {
  const { personagem } = await criarPersonagem({});
  const itemUnico = await criarItem();
  const itemComum = await criarItem();
  await criarEventoAtivo({
    entries: [
      entrada({ key: "unico", id_item: itemUnico.id, weight: 1, eh_unico: true, fallback_key: "comum" }),
      entrada({ key: "comum", id_item: itemComum.id, weight: 3 }),
    ],
  });
  await CharacterInventory.create({ id_personagem: personagem.id, id_item: itemUnico.id, quantidade: 1 });

  const dados = await templeRelicaryService.obterRelicario(personagem.id);

  const chaves = dados.relicario.entries.map((e) => e.key);
  assert.ok(!chaves.includes("unico"), "entry única já possuída não deve aparecer nas odds");
  assert.ok(chaves.includes("comum"));
  const entradaComum = dados.relicario.entries.find((e) => e.key === "comum");
  assert.equal(entradaComum.chance_normal, 1, "única entry elegível restante deve concentrar 100% da chance");
});
