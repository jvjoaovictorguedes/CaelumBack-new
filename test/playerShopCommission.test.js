// Loja do Aventureiro V2 — Fase 6 (encomenda direcionada: negociação +
// contraproposta versionada + aceite com escrow). playerShopCommissionService.js.
const test = require("node:test");
const assert = require("node:assert/strict");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const User = require("../src/models/User");
const Character = require("../src/models/Character");
const Item = require("../src/models/Item");
const WeaponProperties = require("../src/models/WeaponProperties");
const CharacterInventory = require("../src/models/CharacterInventory");
const CharacterEquipmentInstance = require("../src/models/CharacterEquipmentInstance");
const PlayerShop = require("../src/models/PlayerShop");
const PlayerShopCommission = require("../src/models/PlayerShopCommission");
const PlayerShopCommissionOffer = require("../src/models/PlayerShopCommissionOffer");
const PlayerShopCommissionLog = require("../src/models/PlayerShopCommissionLog");
const playerShopService = require("../src/services/playerShopService");
const playerShopCommissionService = require("../src/services/playerShopCommissionService");
const equipmentInstanceService = require("../src/services/equipmentInstanceService");

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
const encomendasCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (encomendasCriadas.length > 0) {
    await PlayerShopCommissionLog.destroy({ where: { id_encomenda: encomendasCriadas } });
    await PlayerShopCommissionOffer.destroy({ where: { id_encomenda: encomendasCriadas } });
    await PlayerShopCommission.destroy({ where: { id: encomendasCriadas } });
  }
  if (personagensCriados.length > 0) {
    await PlayerShop.destroy({ where: { id_personagem: personagensCriados } });
    await CharacterEquipmentInstance.destroy({ where: { id_personagem: personagensCriados } });
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

async function novaLojaComEncomendas(personagem) {
  return playerShopService.criarOuAtualizarLoja(personagem.id, { nome: `Loja ${sufixo()}`, aceita_encomendas: true });
}

async function novoItemEstocavel() {
  const item = await Item.create({
    nome: `Poção Encomendada ${sufixo()}`,
    descricao: "Feita sob medida.",
    tipo_item: "Consumivel",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco("encomenda: criarEncomenda recusa loja que não aceita encomendas", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}`, aceita_encomendas: false });

  await assert.rejects(
    () =>
      playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
        id_item: item.id,
        quantidade: 1,
        preco_unitario: 50,
        prazo_entrega_dias: 2,
      }),
    /não está aceitando encomendas/,
  );
});

testeComBanco("encomenda: fluxo completo — proposta inicial, contraproposta, aceite trava termos e reserva ouro do cliente", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await novaLojaComEncomendas(lojista);
  cliente.dinheiro = 1000;
  await cliente.save();

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 3,
    preco_unitario: 20,
    prazo_entrega_dias: 5,
    mensagem: "Preciso de 3 unidades.",
  });
  encomendasCriadas.push(encomenda.id);
  assert.equal(encomenda.status, "AguardandoLojista");
  assert.equal(encomenda.proposal_version, 1);

  // Cliente não pode aceitar a própria proposta inicial.
  await assert.rejects(
    () => playerShopCommissionService.aceitarOferta(encomenda.id, cliente.id, 1),
    /vez da outra parte/,
  );

  // Lojista contrapropõe um preço maior.
  const { encomenda: apoisContra } = await playerShopCommissionService.contraPropor(encomenda.id, lojista.id, {
    quantidade: 3,
    preco_unitario: 30,
    prazo_entrega_dias: 4,
    mensagem: "30 cada, fica pronto em 4 dias.",
  });
  assert.equal(apoisContra.status, "AguardandoCliente");
  assert.equal(apoisContra.proposal_version, 2);

  // Lojista não pode aceitar a própria contraproposta.
  await assert.rejects(
    () => playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 2),
    /vez da outra parte/,
  );

  // Cliente aceita a v2 — termos travam e ouro é reservado AGORA.
  const aceita = await playerShopCommissionService.aceitarOferta(encomenda.id, cliente.id, 2);
  assert.equal(aceita.status, "Aceita");
  assert.equal(aceita.quantidade_acordada, 3);
  assert.equal(aceita.preco_unitario_acordado, 30);
  assert.equal(aceita.preco_total_acordado, 90);
  assert.equal(aceita.ouro_reservado, 90);
  assert.ok(aceita.aceito_em);

  const clienteDepois = await Character.findByPk(cliente.id);
  assert.equal(clienteDepois.dinheiro, 910, "ouro do cliente só é debitado no ACEITE, nunca antes");

  const ofertas = await PlayerShopCommissionOffer.findAll({ where: { id_encomenda: encomenda.id }, order: [["proposal_version", "ASC"]] });
  assert.equal(ofertas[0].status, "Superada", "a proposta v1 precisa ter sido marcada Superada pela contraproposta");
  assert.equal(ofertas[1].status, "Aceita");
});

testeComBanco("encomenda: aceitar com proposal_version desatualizada é rejeitado (concorrência)", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await novaLojaComEncomendas(lojista);
  cliente.dinheiro = 1000;
  await cliente.save();

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 1,
    preco_unitario: 10,
    prazo_entrega_dias: 1,
  });
  encomendasCriadas.push(encomenda.id);

  // Lojista contrapropõe (vira v2) ANTES do cliente tentar aceitar a v1.
  await playerShopCommissionService.contraPropor(encomenda.id, lojista.id, {
    quantidade: 1,
    preco_unitario: 15,
    prazo_entrega_dias: 1,
  });

  await assert.rejects(
    () => playerShopCommissionService.aceitarOferta(encomenda.id, cliente.id, 1),
    /já foi superada/,
  );
});

testeComBanco("encomenda: recusar encerra a negociação sem debitar ouro de ninguém", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await novaLojaComEncomendas(lojista);
  cliente.dinheiro = 500;
  await cliente.save();

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 1,
    preco_unitario: 10,
    prazo_entrega_dias: 1,
  });
  encomendasCriadas.push(encomenda.id);

  const recusada = await playerShopCommissionService.recusar(encomenda.id, lojista.id);
  assert.equal(recusada.status, "Recusada");
  assert.ok(recusada.recusado_em);

  const clienteDepois = await Character.findByPk(cliente.id);
  assert.equal(clienteDepois.dinheiro, 500, "recusar antes do aceite nunca mexe no ouro de ninguém");

  await assert.rejects(
    () => playerShopCommissionService.contraPropor(encomenda.id, cliente.id, { quantidade: 1, preco_unitario: 10, prazo_entrega_dias: 1 }),
    /não está mais em negociação/,
  );
});

testeComBanco("encomenda: terceiro sem relação com a negociação não pode agir nela", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const { personagem: estranho } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await novaLojaComEncomendas(lojista);

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 1,
    preco_unitario: 10,
    prazo_entrega_dias: 1,
  });
  encomendasCriadas.push(encomenda.id);

  await assert.rejects(
    () => playerShopCommissionService.recusar(encomenda.id, estranho.id),
    (erro) => erro.statusCode === 403,
  );
});

testeComBanco("encomenda: entregarEncomenda (stack) transfere o item, paga o líquido ao lojista e conclui", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await novaLojaComEncomendas(lojista);
  cliente.dinheiro = 1000;
  await cliente.save();
  await CharacterInventory.create({ id_personagem: lojista.id, id_item: item.id, quantidade: 5 });

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 5,
    preco_unitario: 10,
    prazo_entrega_dias: 2,
  });
  encomendasCriadas.push(encomenda.id);
  await playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 1);

  await assert.rejects(
    () => playerShopCommissionService.entregarEncomenda(encomenda.id, cliente.id, {}),
    /Só o lojista/,
  );

  const concluida = await playerShopCommissionService.entregarEncomenda(encomenda.id, lojista.id, {});
  assert.equal(concluida.status, "Concluida");
  assert.equal(concluida.ouro_reservado, 0);
  assert.ok(concluida.concluido_em);

  // preco_total_acordado = 5*10 = 50; taxa 8% = 4 (floor); líquido = 46.
  const lojistaDepois = await Character.findByPk(lojista.id);
  assert.equal(lojistaDepois.dinheiro, 46, "lojista recebe o valor líquido (total - taxa) só na entrega");

  const estoqueLojista = await CharacterInventory.findOne({ where: { id_personagem: lojista.id, id_item: item.id } });
  assert.equal(estoqueLojista.quantidade, 0, "os 5 combinados saem do inventário do lojista");
  const estoqueCliente = await CharacterInventory.findOne({ where: { id_personagem: cliente.id, id_item: item.id } });
  assert.equal(estoqueCliente.quantidade, 5, "cliente recebe os 5 itens entregues");

  await assert.rejects(
    () => playerShopCommissionService.entregarEncomenda(encomenda.id, lojista.id, {}),
    /precisa estar Aceita/,
  );
});

testeComBanco("encomenda: entregarEncomenda (equipamento) usa a transferência DIRETA, nunca o fluxo do Mercado", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await Item.create({
    nome: `Espada Encomendada ${sufixo()}`,
    descricao: "Forjada sob medida.",
    tipo_item: "Arma",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  await WeaponProperties.create({
    id_item: item.id,
    dano_min: 5,
    dano_max: 10,
    tipo_dano: "Fisico",
    tipo_arma: "Espada",
  });
  await novaLojaComEncomendas(lojista);
  cliente.dinheiro = 1000;
  await cliente.save();

  const instancia = await sequelize.transaction((t) =>
    equipmentInstanceService.create({ idPersonagem: lojista.id, idItem: item.id, raridade: "Comum" }, t),
  );

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 1,
    preco_unitario: 100,
    prazo_entrega_dias: 3,
  });
  encomendasCriadas.push(encomenda.id);
  await playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 1);

  await assert.rejects(
    () => playerShopCommissionService.entregarEncomenda(encomenda.id, lojista.id, {}),
    /id_instancia é obrigatório/,
  );

  const concluida = await playerShopCommissionService.entregarEncomenda(encomenda.id, lojista.id, { id_instancia: instancia.id });
  assert.equal(concluida.status, "Concluida");

  const instanciaDepois = await CharacterEquipmentInstance.findByPk(instancia.id);
  assert.equal(instanciaDepois.id_personagem, cliente.id, "a posse do equipamento muda pro cliente direto, sem passar por estado Mercado");
  assert.equal(instanciaDepois.estado, "Inventario", "nunca fica preso em estado Mercado — a Encomenda não usa reserveForMarket");

  // 100 * 8% = 8 de taxa; líquido = 92.
  const lojistaDepois = await Character.findByPk(lojista.id);
  assert.equal(lojistaDepois.dinheiro, 92);
});

testeComBanco("encomenda: cancelarAposAceite reembolsa o cliente e é idempotente", async () => {
  const { personagem: lojista } = await novoPersonagem();
  const { personagem: cliente } = await novoPersonagem();
  const item = await novoItemEstocavel();
  await novaLojaComEncomendas(lojista);
  cliente.dinheiro = 1000;
  await cliente.save();

  const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
    id_item: item.id,
    quantidade: 2,
    preco_unitario: 25,
    prazo_entrega_dias: 1,
  });
  encomendasCriadas.push(encomenda.id);
  await playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 1);

  const clienteAposAceite = await Character.findByPk(cliente.id);
  assert.equal(clienteAposAceite.dinheiro, 950);

  const cancelada = await playerShopCommissionService.cancelarAposAceite(encomenda.id, lojista.id);
  assert.equal(cancelada.status, "Cancelada");
  assert.equal(cancelada.ouro_reservado, 0);

  const clienteAposCancelar = await Character.findByPk(cliente.id);
  assert.equal(clienteAposCancelar.dinheiro, 1000, "os 50 reservados voltam inteiros — nada foi entregue ainda");

  await assert.rejects(
    () => playerShopCommissionService.cancelarAposAceite(encomenda.id, lojista.id),
    /não está mais no estado Aceita/,
  );
  const clienteAposSegundoCancelar = await Character.findByPk(cliente.id);
  assert.equal(clienteAposSegundoCancelar.dinheiro, 1000, "cancelar 2x não pode reembolsar de novo");
});
