// Loja do Aventureiro V2 — Fase 5 (demanda do lojista + escrow +
// entrega parcial). playerShopDemandService.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const Character = require("../src/models/Character");
const Item = require("../src/models/Item");
const CharacterInventory = require("../src/models/CharacterInventory");
const PlayerShop = require("../src/models/PlayerShop");
const PlayerShopDemand = require("../src/models/PlayerShopDemand");
const PlayerShopDemandDelivery = require("../src/models/PlayerShopDemandDelivery");
const playerShopService = require("../src/services/playerShopService");
const playerShopDemandService = require("../src/services/playerShopDemandService");

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

const personagensCriados = [];
const usuariosCriados = [];
const itensCriados = [];
const demandasCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (demandasCriadas.length > 0) {
    await PlayerShopDemandDelivery.destroy({ where: { id_demanda: demandasCriadas } });
    await PlayerShopDemand.destroy({ where: { id: demandasCriadas } });
  }
  if (personagensCriados.length > 0) {
    await PlayerShop.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterInventory.destroy({ where: { id_personagem: personagensCriados } });
    await Character.destroy({ where: { id: personagensCriados } });
  }
  if (usuariosCriados.length > 0) await User.destroy({ where: { id: usuariosCriados } });
  if (itensCriados.length > 0) await Item.destroy({ where: { id: itensCriados } });
  await sequelize.close();
});

async function novoPersonagem() {
  const { usuario, personagem } = await criarPersonagem({ nivel: 5 });
  usuariosCriados.push(usuario.id);
  personagensCriados.push(personagem.id);
  return { usuario, personagem };
}

async function novoItemEstocavel() {
  const item = await Item.create({
    nome: `Minério de Teste ${sufixo()}`,
    descricao: "Material bruto.",
    tipo_item: "Material",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("demanda: criarDemanda reserva o ouro inteiro na hora e exige loja criada", async () => {
  const { personagem } = await novoPersonagem();
  const item = await novoItemEstocavel();

  await assert.rejects(
    () => playerShopDemandService.criarDemanda(personagem.id, { id_item: item.id, quantidade: 5, preco_unitario: 10 }),
    /Crie sua loja/,
  );

  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });
  personagem.dinheiro = 1000;
  await personagem.save();

  const demanda = await playerShopDemandService.criarDemanda(personagem.id, {
    id_item: item.id,
    quantidade: 5,
    preco_unitario: 10,
  });
  demandasCriadas.push(demanda.id);

  assert.equal(demanda.ouro_reservado, 50);
  assert.equal(demanda.status, "Aberta");

  const atualizado = await Character.findByPk(personagem.id);
  assert.equal(atualizado.dinheiro, 950, "o ouro total (5*10) precisa sair da carteira na CRIAÇÃO, não na entrega");
});

testeComBanco("demanda: criarDemanda recusa sem ouro suficiente", async () => {
  const { personagem } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}` });
  personagem.dinheiro = 10;
  await personagem.save();

  await assert.rejects(
    () => playerShopDemandService.criarDemanda(personagem.id, { id_item: item.id, quantidade: 5, preco_unitario: 10 }),
    /Moedas insuficientes/,
  );
});

testeComBanco("demanda: entregarItem paga o fornecedor direto e nunca deixa negativo (sem goldService.concederOuro)", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: fornecedor } = await novoPersonagem();
  const item = await novoItemEstocavel();

  await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}` });
  lojista.dinheiro = 1000;
  await lojista.save();
  fornecedor.dinheiro = 0;
  await fornecedor.save();
  await CharacterInventory.create({ id_personagem: fornecedor.id, id_item: item.id, quantidade: 10 });

  const demanda = await playerShopDemandService.criarDemanda(lojista.id, {
    id_item: item.id,
    quantidade: 10,
    preco_unitario: 5,
  });
  demandasCriadas.push(demanda.id);

  const { demanda: parcial } = await playerShopDemandService.entregarItem(demanda.id, fornecedor.id, 4);
  assert.equal(parcial.status, "Aberta");
  assert.equal(parcial.quantidade_entregue, 4);
  assert.equal(parcial.ouro_reservado, 30, "50 - 4*5 = 30 ainda reservado");

  const fornecedorAposParcial = await Character.findByPk(fornecedor.id);
  assert.equal(fornecedorAposParcial.dinheiro, 20, "fornecedor recebe 4*5=20 na hora da entrega");

  const estoqueFornecedor = await CharacterInventory.findOne({ where: { id_personagem: fornecedor.id, id_item: item.id } });
  assert.equal(estoqueFornecedor.quantidade, 6, "6 restantes no inventário do fornecedor (10 - 4 entregues)");

  const estoqueLojista = await CharacterInventory.findOne({ where: { id_personagem: lojista.id, id_item: item.id } });
  assert.equal(estoqueLojista.quantidade, 4, "lojista recebe os itens entregues no próprio inventário");

  const { demanda: completa } = await playerShopDemandService.entregarItem(demanda.id, fornecedor.id, 6);
  assert.equal(completa.status, "Concluida");
  assert.equal(completa.ouro_reservado, 0);
  assert.ok(completa.concluido_em);

  const fornecedorFinal = await Character.findByPk(fornecedor.id);
  assert.equal(fornecedorFinal.dinheiro, 50, "fornecedor recebeu o total das duas entregas (20+30)");
});

testeComBanco("demanda: entregarItem recusa passar da quantidade restante e recusa entrega na própria demanda", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: fornecedor } = await novoPersonagem();
  const item = await novoItemEstocavel();

  await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}` });
  lojista.dinheiro = 1000;
  await lojista.save();
  await CharacterInventory.create({ id_personagem: lojista.id, id_item: item.id, quantidade: 20 });
  await CharacterInventory.create({ id_personagem: fornecedor.id, id_item: item.id, quantidade: 20 });

  const demanda = await playerShopDemandService.criarDemanda(lojista.id, {
    id_item: item.id,
    quantidade: 5,
    preco_unitario: 2,
  });
  demandasCriadas.push(demanda.id);

  await assert.rejects(
    () => playerShopDemandService.entregarItem(demanda.id, lojista.id, 1),
    /própria demanda/,
  );
  await assert.rejects(
    () => playerShopDemandService.entregarItem(demanda.id, fornecedor.id, 6),
    /só precisa de mais/,
  );
});

testeComBanco("demanda: cancelarDemanda reembolsa o ouro restante e é idempotente (não credita 2x)", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: fornecedor } = await novoPersonagem();
  const item = await novoItemEstocavel();

  await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}` });
  lojista.dinheiro = 1000;
  await lojista.save();
  await CharacterInventory.create({ id_personagem: fornecedor.id, id_item: item.id, quantidade: 10 });

  const demanda = await playerShopDemandService.criarDemanda(lojista.id, {
    id_item: item.id,
    quantidade: 10,
    preco_unitario: 5,
  });
  demandasCriadas.push(demanda.id);
  await playerShopDemandService.entregarItem(demanda.id, fornecedor.id, 2);

  const cancelada = await playerShopDemandService.cancelarDemanda(demanda.id, lojista.id);
  assert.equal(cancelada.status, "Cancelada");
  assert.equal(cancelada.ouro_reservado, 0);

  const lojistaAposCancelar = await Character.findByPk(lojista.id);
  assert.equal(lojistaAposCancelar.dinheiro, 1000 - 50 + 40, "950 debitados na criação + 40 (ouro_reservado restante) devolvidos no cancelamento");

  await assert.rejects(
    () => playerShopDemandService.cancelarDemanda(demanda.id, lojista.id),
    /não está mais aberta/,
  );
  const lojistaAposSegundoCancelar = await Character.findByPk(lojista.id);
  assert.equal(
    lojistaAposSegundoCancelar.dinheiro,
    lojistaAposCancelar.dinheiro,
    "cancelar 2x não pode creditar o reembolso de novo",
  );
});

testeComBanco("demanda: listarDemandasAbertas só mostra demandas com status Aberta", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}` });
  lojista.dinheiro = 1000;
  await lojista.save();

  const demanda = await playerShopDemandService.criarDemanda(lojista.id, {
    id_item: item.id,
    quantidade: 3,
    preco_unitario: 10,
  });
  demandasCriadas.push(demanda.id);
  await playerShopDemandService.cancelarDemanda(demanda.id, lojista.id);

  const resultado = await playerShopDemandService.listarDemandasAbertas({ idItem: item.id });
  assert.equal(resultado.demandas.find((d) => d.id === demanda.id), undefined, "demanda cancelada não pode aparecer na listagem pública");
});
