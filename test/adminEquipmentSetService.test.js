// Painel Administrativo — Conjuntos de Equipamentos (bug reportado: "não
// consigo colocar o ID do item que eu quero"). A causa raiz era o
// ItemSelect do frontend (select nativo sem busca — ver
// src/components/admin/ItemPicker.tsx no CaelumFront-new), não o
// backend. Esta suíte cobre a camada de service admin
// (adminEquipmentSetService.addAdminEquipmentSetPiece), que já estava
// majoritariamente correta — só faltava validar que item_id é de fato
// um inteiro positivo antes de bater no banco (endurecido nesta mesma
// correção). Nunca duplica a suíte de equipmentSetService.test.js, que
// cobre a contagem/dedupe por piece_key e os bônus em combate.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, sufixo } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const EquipmentSet = require("../src/models/EquipmentSet");
const EquipmentSetPiece = require("../src/models/EquipmentSetPiece");
const User = require("../src/models/User");
const AdminActionLog = require("../src/models/AdminActionLog");
const adminEquipmentSetService = require("../src/services/adminEquipmentSetService");
const { resolverConjuntosEquipados } = require("../src/services/equipmentSetService");

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

const ADMIN_FAKE_REQ = { ip: "127.0.0.1", headers: {}, get: () => "teste-agent" };

async function criarAdmin() {
  const chave = sufixo();
  return User.create({
    username: `admin_sets_${chave}`,
    email: `admin_sets_${chave}@teste.local`,
    passwordHash: "hash-de-teste",
    isAdmin: true,
  });
}

async function criarItem({ ativo = true } = {}) {
  return Item.create({
    nome: `Item Teste ${sufixo()}`,
    descricao: "Item descartável de teste.",
    tipo_item: "Acessorio1",
    raridade: "Raro",
    valor_compra: 0,
    valor_venda: 0,
    peso: 1,
    disponivel_loja: false,
    ativo,
  });
}

async function criarSet() {
  return EquipmentSet.create({ key: `set_admin_teste_${sufixo()}`, nome: "Conjunto Admin Teste", ativo: false });
}

test.after(async () => {
  if (temBanco) {
    const { sequelize } = require("../src/config/database");
    await sequelize.close();
  }
});

// ------------------------------------------------------------------ PEÇAS

testeComBanco("adicionar peça com item_id válido: salva com o item_id correto", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();
  const item = await criarItem();

  const peca = await adminEquipmentSetService.addAdminEquipmentSetPiece(
    set.id,
    { item_id: item.id, piece_key: "peito", ordem: 1 },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );

  assert.equal(peca.item_id, item.id, "a peça salva precisa manter o item_id correto, não outro id qualquer");
  assert.equal(peca.piece_key, "peito");
  assert.equal(peca.equipment_set_id, set.id);

  const persistida = await EquipmentSetPiece.findByPk(peca.id);
  assert.equal(persistida.item_id, item.id, "o que foi persistido no banco também precisa bater com o item_id enviado");
});

testeComBanco("adicionar peça com item_id inexistente é rejeitado com 404", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();

  await assert.rejects(
    () =>
      adminEquipmentSetService.addAdminEquipmentSetPiece(
        set.id,
        { item_id: 999999999, piece_key: "peito" },
        { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
      ),
    (erro) => {
      assert.match(erro.message, /Item não encontrado/i);
      assert.equal(erro.statusCode, 404);
      return true;
    },
  );
});

testeComBanco("adicionar peça com item desativado é rejeitado", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();
  const itemInativo = await criarItem({ ativo: false });

  await assert.rejects(
    () =>
      adminEquipmentSetService.addAdminEquipmentSetPiece(
        set.id,
        { item_id: itemInativo.id, piece_key: "peito" },
        { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
      ),
    /Item desativado/i,
  );

  const pecas = await EquipmentSetPiece.findAll({ where: { equipment_set_id: set.id } });
  assert.equal(pecas.length, 0, "nenhuma peça pode ter sido criada");
});

testeComBanco("item_id inválido (string, float, negativo, zero, ausente) é rejeitado antes de tocar o banco", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();

  const payloadsInvalidos = [
    { item_id: "abc", piece_key: "peito" },
    { item_id: 1.5, piece_key: "peito" },
    { item_id: -3, piece_key: "peito" },
    { item_id: 0, piece_key: "peito" },
    { item_id: null, piece_key: "peito" },
    { piece_key: "peito" },
  ];

  for (const payload of payloadsInvalidos) {
    await assert.rejects(
      () => adminEquipmentSetService.addAdminEquipmentSetPiece(set.id, payload, { idAdmin: admin.id, req: ADMIN_FAKE_REQ }),
      /item_id/i,
      `payload deveria ter sido rejeitado: ${JSON.stringify(payload)}`,
    );
  }

  const pecas = await EquipmentSetPiece.findAll({ where: { equipment_set_id: set.id } });
  assert.equal(pecas.length, 0);
});

testeComBanco("piece_key duplicado no mesmo conjunto é rejeitado", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();
  const item1 = await criarItem();
  const item2 = await criarItem();

  await adminEquipmentSetService.addAdminEquipmentSetPiece(
    set.id,
    { item_id: item1.id, piece_key: "elmo" },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );

  await assert.rejects(
    () =>
      adminEquipmentSetService.addAdminEquipmentSetPiece(
        set.id,
        { item_id: item2.id, piece_key: "elmo" },
        { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
      ),
    /já existe uma peça com piece_key/i,
  );

  const pecas = await EquipmentSetPiece.findAll({ where: { equipment_set_id: set.id } });
  assert.equal(pecas.length, 1, "a segunda tentativa não pode ter criado uma peça duplicada");
});

testeComBanco("piece_key duplicado NÃO é bloqueado entre conjuntos diferentes (a unicidade é por conjunto)", async () => {
  const admin = await criarAdmin();
  const setA = await criarSet();
  const setB = await criarSet();
  const itemA = await criarItem();
  const itemB = await criarItem();

  await adminEquipmentSetService.addAdminEquipmentSetPiece(
    setA.id,
    { item_id: itemA.id, piece_key: "elmo" },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );
  const pecaB = await adminEquipmentSetService.addAdminEquipmentSetPiece(
    setB.id,
    { item_id: itemB.id, piece_key: "elmo" },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );

  assert.equal(pecaB.piece_key, "elmo");
  assert.equal(pecaB.equipment_set_id, setB.id);
});

testeComBanco("audit log registra a criação da peça com o item_id correto", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();
  const item = await criarItem();

  const peca = await adminEquipmentSetService.addAdminEquipmentSetPiece(
    set.id,
    { item_id: item.id, piece_key: "botas" },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );

  const log = await AdminActionLog.findOne({
    where: { entidade: "EquipmentSetPiece", id_entidade: peca.id, id_admin: admin.id },
    order: [["id", "DESC"]],
  });
  assert.ok(log, "devia existir um audit log da criação da peça");
  assert.equal(log.dados_depois.item_id, item.id);
});

// ----------------------------------------------------- INTEGRAÇÃO COM O SET

testeComBanco("conjunto criado pelo admin continua sendo reconhecido por equipmentSetService (contagem/bônus reais)", async () => {
  const admin = await criarAdmin();
  const set = await criarSet();
  const itemA = await criarItem();
  const itemB = await criarItem();

  await adminEquipmentSetService.addAdminEquipmentSetPiece(
    set.id,
    { item_id: itemA.id, piece_key: "acessorio_a" },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );
  await adminEquipmentSetService.addAdminEquipmentSetPiece(
    set.id,
    { item_id: itemB.id, piece_key: "acessorio_b" },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );
  await adminEquipmentSetService.addAdminEquipmentSetBonus(
    set.id,
    { pieces_required: 2, stats: { vitalidade: 8 } },
    { idAdmin: admin.id, req: ADMIN_FAKE_REQ },
  );
  await adminEquipmentSetService.updateAdminEquipmentSet(set.id, { ativo: true }, { idAdmin: admin.id, req: ADMIN_FAKE_REQ });

  const { criarPersonagem } = require("./helpers/db");
  const CharacterEquipment = require("../src/models/CharacterEquipment");
  const { personagem } = await criarPersonagem();
  await CharacterEquipment.create({ id_personagem: personagem.id, slot: "Acessorio1", id_item: itemA.id });
  await CharacterEquipment.create({ id_personagem: personagem.id, slot: "Acessorio2", id_item: itemB.id });

  const resultado = await resolverConjuntosEquipados(personagem.id);
  assert.equal(resultado.sets.length, 1, "o conjunto criado pelo admin precisa aparecer resolvido");
  assert.equal(resultado.sets[0].equippedPieces, 2);
  assert.equal(resultado.statBonus.vitalidade, 8, "o bônus do conjunto criado via admin precisa funcionar normalmente em combate");
});
