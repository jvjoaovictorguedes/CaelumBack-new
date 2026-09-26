// Painel Administrativo — "Busca" (players.view) e "Inventário"
// (players.manage). Busca é somente leitura; Inventário reaproveita
// inventoryService.addStack/removeStack (nunca escreve quantidade
// direto) e exige motivo em toda correção, igual adminGrantService.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");
// GuildMember->Guild só é registrada dentro de guildController.js (não
// em associations.js) — em produção ela já existe quando este service
// roda porque app.js carrega guildRoutes/guildController antes de tudo;
// aqui, sem o app inteiro de pé, precisa desse require explícito (mesmo
// padrão já usado por guildMural.test.js/characterProfile.test.js).
require("../src/controllers/guildController");

const Item = require("../src/models/Item");
const Character = require("../src/models/Character");
const User = require("../src/models/User");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");
const adminPlayerService = require("../src/services/adminPlayerService");
const adminInventoryService = require("../src/services/adminInventoryService");

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
const personagensCriados = [];
const usuariosCriados = [];

test.after(async () => {
  if (!temBanco) return;
  if (personagensCriados.length > 0) {
    await CharacterEquipmentInstance.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterInventory.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function novoPersonagem(nome) {
  const { usuario, personagem } = await criarPersonagem({ nivel: 3 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  if (nome) {
    personagem.nome = `${nome} ${sufixo()}`;
    await personagem.save();
  }
  return { usuario, personagem };
}

async function criarItemMaterial(nome = "Item de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item de teste do admin de Jogadores.",
    tipo_item: "Material",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

async function criarItemEquipavel(nome = "Espada de Teste") {
  const item = await Item.create({
    nome: `${nome} ${sufixo()}`,
    descricao: "Item equipável de teste.",
    tipo_item: "Arma",
    raridade: "Comum",
  });
  itensCriados.push(item.id);
  return item;
}

// ---------------------------------------------------------------- BUSCA
testeComBanco("busca: searchPlayers exige ao menos 2 caracteres", async () => {
  await assert.rejects(() => adminPlayerService.searchPlayers("a"), /ao menos 2 caracteres/i);
});

testeComBanco("busca: searchPlayers encontra por nome de personagem (parcial, case-insensitive)", async () => {
  const marca = sufixo();
  const { personagem } = await novoPersonagem(`Buscavel${marca}`);

  const resultado = await adminPlayerService.searchPlayers(`buscavel${marca}`.toUpperCase());
  assert.ok(resultado.some((p) => p.id === personagem.id));
});

testeComBanco("busca: searchPlayers por ID exato encontra o personagem", async () => {
  const { personagem } = await novoPersonagem();
  const resultado = await adminPlayerService.searchPlayers(String(personagem.id));
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].id, personagem.id);
});

testeComBanco("busca: getPlayerDetail devolve classe/raça/usuário e guilda null quando sem guilda", async () => {
  const { personagem, usuario } = await novoPersonagem();

  const detalhe = await adminPlayerService.getPlayerDetail(personagem.id);
  assert.equal(detalhe.id, personagem.id);
  assert.ok(detalhe.classe);
  assert.ok(detalhe.raca);
  assert.equal(detalhe.guilda, null);
  assert.equal(detalhe.usuario.username, usuario.username);
});

testeComBanco("busca: getPlayerDetail em id inexistente lança 404", async () => {
  await assert.rejects(
    () => adminPlayerService.getPlayerDetail(999999999),
    (err) => err.statusCode === 404,
  );
});

// ------------------------------------------------------------ INVENTÁRIO
testeComBanco("inventário: setInventoryStackQuantity exige motivo", async () => {
  const { personagem } = await novoPersonagem();
  const item = await criarItemMaterial();
  await assert.rejects(
    () => adminInventoryService.setInventoryStackQuantity(personagem.id, item.id, 5, { idAdmin: 1 }),
    /motivo é obrigatório/i,
  );
});

testeComBanco("inventário: setInventoryStackQuantity cria/aumenta/reduz/zera via addStack/removeStack", async () => {
  const { personagem } = await novoPersonagem();
  const item = await criarItemMaterial();

  const criado = await adminInventoryService.setInventoryStackQuantity(personagem.id, item.id, 10, {
    idAdmin: 1,
    motivo: "correção de teste",
  });
  assert.equal(criado.quantidade_antes, 0);
  assert.equal(criado.quantidade_depois, 10);

  let entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
  assert.equal(entrada.quantidade, 10);

  const reduzido = await adminInventoryService.setInventoryStackQuantity(personagem.id, item.id, 3, {
    idAdmin: 1,
    motivo: "correção de teste",
  });
  assert.equal(reduzido.quantidade_antes, 10);
  assert.equal(reduzido.quantidade_depois, 3);

  const zerado = await adminInventoryService.setInventoryStackQuantity(personagem.id, item.id, 0, {
    idAdmin: 1,
    motivo: "correção de teste",
  });
  assert.equal(zerado.quantidade_depois, 0);

  entrada = await CharacterInventory.findOne({ where: { id_personagem: personagem.id, id_item: item.id } });
  assert.equal(entrada, null, "quantidade 0 remove a linha, igual removeStack faz em qualquer outro fluxo");
});

testeComBanco("inventário: setInventoryStackQuantity rejeita quantidade negativa/não-inteira", async () => {
  const { personagem } = await novoPersonagem();
  const item = await criarItemMaterial();
  await assert.rejects(
    () => adminInventoryService.setInventoryStackQuantity(personagem.id, item.id, -1, { idAdmin: 1, motivo: "x" }),
    /inteiro >= 0/i,
  );
});

testeComBanco("inventário: getCharacterInventory lista stacks e equipamentos com dados do Item", async () => {
  const { personagem } = await novoPersonagem();
  const itemMaterial = await criarItemMaterial();
  const itemArma = await criarItemEquipavel();

  await adminInventoryService.setInventoryStackQuantity(personagem.id, itemMaterial.id, 4, {
    idAdmin: 1,
    motivo: "setup",
  });
  await sequelize.transaction((t) => equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: itemArma.id, raridade: "Comum" }, t));

  const inventario = await adminInventoryService.getCharacterInventory(personagem.id);
  assert.equal(inventario.personagem.id, personagem.id);
  assert.equal(inventario.stacks.length, 1);
  assert.equal(inventario.stacks[0].itemEspolio.nome, itemMaterial.nome);
  assert.equal(inventario.equipamentos.length, 1);
  assert.equal(inventario.equipamentos[0].item.nome, itemArma.nome);
});

testeComBanco("inventário: removeEquipmentInstance exige motivo e só remove instância solta (estado Inventario)", async () => {
  const { personagem } = await novoPersonagem();
  const itemArma = await criarItemEquipavel();
  const instancia = await sequelize.transaction((t) =>
    equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: itemArma.id, raridade: "Comum" }, t),
  );

  await assert.rejects(
    () => adminInventoryService.removeEquipmentInstance(instancia.id, { idAdmin: 1 }),
    /motivo é obrigatório/i,
  );

  const resultado = await adminInventoryService.removeEquipmentInstance(instancia.id, {
    idAdmin: 1,
    motivo: "item indevido",
  });
  assert.equal(resultado.removido, true);

  const sobrou = await CharacterEquipmentInstance.findByPk(instancia.id);
  assert.equal(sobrou, null);
});

testeComBanco("inventário: removeEquipmentInstance rejeita instância inexistente com 404", async () => {
  await assert.rejects(
    () => adminInventoryService.removeEquipmentInstance(999999999, { idAdmin: 1, motivo: "x" }),
    (err) => err.statusCode === 404,
  );
});

testeComBanco("inventário: removeEquipmentInstance rejeita instância Equipada (nunca mexe em equipamento em uso)", async () => {
  const { personagem } = await novoPersonagem();
  const itemArma = await criarItemEquipavel();
  const instancia = await sequelize.transaction((t) =>
    equipmentInstanceService.create({ idPersonagem: personagem.id, idItem: itemArma.id, raridade: "Comum" }, t),
  );
  instancia.estado = "Equipada";
  instancia.equipada = true;
  await instancia.save();

  await assert.rejects(
    () => adminInventoryService.removeEquipmentInstance(instancia.id, { idAdmin: 1, motivo: "x" }),
    /Só é possível remover instâncias soltas/i,
  );
});
