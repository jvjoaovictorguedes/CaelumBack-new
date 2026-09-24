// Sistema de Conjuntos de Equipamentos — testes de service/integração
// (Especificação Sistema de Conjuntos §15). Cobre contagem/deduplicação
// por piece_key, thresholds cumulativos, mistura de conjuntos, conjunto
// inativo e a composição final em equipmentBonusService (fonte única de
// atributos efetivos consumida por combate/Poder/UI).
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
const Item = require("../src/models/Item");
const CharacterEquipment = require("../src/models/CharacterEquipment");
const EquipmentSet = require("../src/models/EquipmentSet");
const EquipmentSetPiece = require("../src/models/EquipmentSetPiece");
const EquipmentSetBonus = require("../src/models/EquipmentSetBonus");
const { resolverConjuntosEquipados } = require("../src/services/equipmentSetService");
const { buscarBonusDeAtributos } = require("../src/services/equipmentBonusService");
const inventoryV2Controller = require("../src/controllers/inventoryV2Controller");
// Registra CharacterInventory<->Item (fora de associations.js — padrão
// histórico do projeto, mesmo caso já contornado em test/helpers/db.js
// pra CharacterAbilities) antes do teste que chama o controller.
require("../src/controllers/characterInventoryController");

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

async function criarItemEquipavel(tipo_item = "Acessorio1") {
  return Item.create({
    nome: `Item de Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item,
    raridade: "Raro",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
  });
}

async function equipar(idPersonagem, slot, idItem) {
  return CharacterEquipment.create({ id_personagem: idPersonagem, slot, id_item: idItem });
}

// Monta um conjunto de N peças com thresholds nos pieces_required dados
// (cada threshold pode somar stats e/ou levar effect_key). Devolve os
// Items criados (na mesma ordem) pra o teste equipar quantos quiser.
async function criarConjunto({ numPecas, thresholds }) {
  const set = await EquipmentSet.create({ key: `set_teste_${sufixo()}`, nome: "Conjunto de Teste", ativo: true });
  const itens = [];
  for (let i = 0; i < numPecas; i += 1) {
    const item = await criarItemEquipavel(i === 0 ? "Arma" : "Acessorio1");
    await EquipmentSetPiece.create({
      equipment_set_id: set.id,
      item_id: item.id,
      piece_key: `peca_${i}_${sufixo()}`,
      ordem: i,
    });
    itens.push(item);
  }
  for (const t of thresholds) {
    await EquipmentSetBonus.create({
      equipment_set_id: set.id,
      pieces_required: t.pieces_required,
      stats: t.stats ?? {},
      effect_key: t.effect_key ?? null,
      effect_config: t.effect_config ?? {},
      descricao: t.descricao ?? null,
    });
  }
  return { set, itens };
}

testeComBanco("sem peças equipadas: 0 sets, nenhum stat/effect", async () => {
  const { personagem } = await criarPersonagem();
  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.deepEqual(resultado.sets, []);
  assert.deepEqual(resultado.activeEffects, []);
  assert.equal(resultado.statBonus.vitalidade, 0);
});

testeComBanco("1 peça equipada: nenhum threshold ativo", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 6,
    thresholds: [{ pieces_required: 2, stats: { vitalidade: 8 } }],
  });
  await equipar(personagem.id, "ArmaPrincipal", itens[0].id);

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets.length, 1);
  assert.equal(resultado.sets[0].equippedPieces, 1);
  assert.equal(resultado.sets[0].bonuses[0].active, false);
  assert.equal(resultado.statBonus.vitalidade, 0);
});

testeComBanco("2 peças: threshold 2/N ativa e soma o stat certo", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 6,
    thresholds: [
      { pieces_required: 2, stats: { vitalidade: 8 } },
      { pieces_required: 4, stats: { defesa: 12 } },
      { pieces_required: 6, effect_key: "EFEITO_DE_TESTE" },
    ],
  });
  await equipar(personagem.id, "ArmaPrincipal", itens[0].id);
  await equipar(personagem.id, "Acessorio1", itens[1].id);

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets[0].equippedPieces, 2);
  assert.equal(resultado.statBonus.vitalidade, 8);
  assert.equal(resultado.statBonus.defesa, 0);
  assert.deepEqual(resultado.activeEffects, []);
});

testeComBanco("4 peças: thresholds 2/N e 4/N cumulativos (nunca substituem)", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 6,
    thresholds: [
      { pieces_required: 2, stats: { vitalidade: 8 } },
      { pieces_required: 4, stats: { defesa: 12 } },
      { pieces_required: 6, effect_key: "SANGUE_DRACONICO_TESTE" },
    ],
  });
  // 7 slots reais no boneco de papel — usa 4 distintos pra ocupar 4
  // peças lógicas diferentes.
  await equipar(personagem.id, "ArmaPrincipal", itens[0].id);
  await equipar(personagem.id, "ArmaSecundaria", itens[1].id);
  await equipar(personagem.id, "Acessorio1", itens[2].id);
  await equipar(personagem.id, "Acessorio2", itens[3].id);

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets[0].equippedPieces, 4);
  assert.equal(resultado.statBonus.vitalidade, 8, "2/N continua ativo com 4 peças");
  assert.equal(resultado.statBonus.defesa, 12);
  assert.deepEqual(resultado.activeEffects, [], "6/N ainda não deve ativar com só 4 peças");
});

testeComBanco("6 peças: todos os thresholds ativos, incluindo a passiva (effect_key)", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 6,
    thresholds: [
      { pieces_required: 2, stats: { vitalidade: 8 } },
      { pieces_required: 4, stats: { defesa: 12 } },
      { pieces_required: 6, effect_key: "SANGUE_DRACONICO_TESTE", effect_config: { potencia: 5 } },
    ],
  });
  const slots = ["ArmaPrincipal", "ArmaSecundaria", "Cabeca", "Torso", "Pes", "Acessorio1"];
  for (let i = 0; i < 6; i += 1) {
    await equipar(personagem.id, slots[i], itens[i].id);
  }

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets[0].equippedPieces, 6);
  assert.equal(resultado.statBonus.vitalidade, 8);
  assert.equal(resultado.statBonus.defesa, 12);
  assert.equal(resultado.activeEffects.length, 1);
  assert.equal(resultado.activeEffects[0].effectKey, "SANGUE_DRACONICO_TESTE");
  assert.equal(resultado.activeEffects[0].piecesRequired, 6);
  assert.deepEqual(resultado.activeEffects[0].config, { potencia: 5 });
});

testeComBanco("peça lógica duplicada (mesmo item nos dois slots de acessório) conta uma vez só", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 6,
    thresholds: [{ pieces_required: 2, stats: { vitalidade: 8 } }],
  });
  // Mesmo id_item nos dois slots de acessório — situação de inventário
  // que a spec pede pra nunca contar em dobro (§3).
  await equipar(personagem.id, "Acessorio1", itens[0].id);
  await equipar(personagem.id, "Acessorio2", itens[0].id);

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets[0].equippedPieces, 1, "mesma peça lógica em 2 slots não pode contar como 2");
  assert.equal(resultado.statBonus.vitalidade, 0);
});

testeComBanco("mistura de conjuntos: 4 peças do A + 2 do B ativam thresholds independentes", async () => {
  const { personagem } = await criarPersonagem();
  const conjuntoA = await criarConjunto({
    numPecas: 4,
    thresholds: [
      { pieces_required: 2, stats: { vitalidade: 5 } },
      { pieces_required: 4, stats: { defesa: 10 } },
    ],
  });
  const conjuntoB = await criarConjunto({
    numPecas: 2,
    thresholds: [{ pieces_required: 2, stats: { forca: 7 } }],
  });

  await equipar(personagem.id, "ArmaPrincipal", conjuntoA.itens[0].id);
  await equipar(personagem.id, "ArmaSecundaria", conjuntoA.itens[1].id);
  await equipar(personagem.id, "Cabeca", conjuntoA.itens[2].id);
  await equipar(personagem.id, "Torso", conjuntoA.itens[3].id);
  await equipar(personagem.id, "Acessorio1", conjuntoB.itens[0].id);
  await equipar(personagem.id, "Acessorio2", conjuntoB.itens[1].id);

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets.length, 2);
  assert.equal(resultado.statBonus.vitalidade, 5);
  assert.equal(resultado.statBonus.defesa, 10);
  assert.equal(resultado.statBonus.forca, 7);
});

testeComBanco("conjunto inativo (ativo=false) não concede bônus mesmo equipado por completo", async () => {
  const { personagem } = await criarPersonagem();
  const { set, itens } = await criarConjunto({
    numPecas: 2,
    thresholds: [{ pieces_required: 2, stats: { vitalidade: 99 } }],
  });
  await equipar(personagem.id, "Acessorio1", itens[0].id);
  await equipar(personagem.id, "Acessorio2", itens[1].id);
  await set.update({ ativo: false });

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.deepEqual(resultado.sets, []);
  assert.equal(resultado.statBonus.vitalidade, 0);
});

testeComBanco("equipmentBonusService soma o stat de conjunto por cima do bônus normal de equipamento", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 2,
    thresholds: [{ pieces_required: 2, stats: { vitalidade: 8 } }],
  });
  await equipar(personagem.id, "Acessorio1", itens[0].id);
  await equipar(personagem.id, "Acessorio2", itens[1].id);

  const bonus = await buscarBonusDeAtributos(personagem.id);
  assert.equal(bonus.vitalidade, 8);
});

testeComBanco("GET /inventory/v2 devolve equipmentSets já resolvido (backend autoritativo)", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 2,
    thresholds: [{ pieces_required: 2, stats: { vitalidade: 8 } }],
  });
  await equipar(personagem.id, "Acessorio1", itens[0].id);
  await equipar(personagem.id, "Acessorio2", itens[1].id);

  let statusCode = null;
  let corpo = null;
  const req = { personagemAtual: { id: personagem.id } };
  const res = {
    status(codigo) {
      statusCode = codigo;
      return this;
    },
    json(payload) {
      corpo = payload;
      return this;
    },
  };

  await inventoryV2Controller.obterInventarioV2(req, res);

  assert.equal(statusCode, 200);
  assert.equal(corpo.data.equipmentSets.length, 1);
  assert.equal(corpo.data.equipmentSets[0].equippedPieces, 2);
  assert.equal(corpo.data.equipmentSets[0].bonuses[0].active, true);
});

testeComBanco("desequipar uma peça remove imediatamente o threshold que deixa de ser atendido", async () => {
  const { personagem } = await criarPersonagem();
  const { itens } = await criarConjunto({
    numPecas: 2,
    thresholds: [{ pieces_required: 2, stats: { vitalidade: 8 } }],
  });
  await equipar(personagem.id, "Acessorio1", itens[0].id);
  const linhaAcessorio2 = await equipar(personagem.id, "Acessorio2", itens[1].id);

  let resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.statBonus.vitalidade, 8);

  await linhaAcessorio2.destroy();

  resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.statBonus.vitalidade, 0);
});
