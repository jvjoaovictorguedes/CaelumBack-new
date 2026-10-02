// Loja do Aventureiro V2 — Fase 10 (testes de concorrência/segurança).
// Dois cenários pedidos explicitamente pelo doc: duas entregas de
// Demanda disputando o mesmo restante ao mesmo tempo (double-spend do
// ouro reservado / entrega além do pedido), e duas tentativas de aceite
// de Encomenda concorrentes (aceitar duas vezes a mesma versão de
// oferta não pode debitar o cliente duas vezes nem travar os termos
// duas vezes).
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
const PlayerShopCommission = require("../src/models/PlayerShopCommission");
const PlayerShopCommissionOffer = require("../src/models/PlayerShopCommissionOffer");
const PlayerShopCommissionLog = require("../src/models/PlayerShopCommissionLog");
const playerShopService = require("../src/services/playerShopService");
const playerShopDemandService = require("../src/services/playerShopDemandService");
const playerShopCommissionService = require("../src/services/playerShopCommissionService");

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
const encomendasCriadas = [];

test.after(async () => {
  if (!temBanco) return;
  if (demandasCriadas.length > 0) {
    await PlayerShopDemandDelivery.destroy({ where: { id_demanda: demandasCriadas } });
    await PlayerShopDemand.destroy({ where: { id: demandasCriadas } });
  }
  if (encomendasCriadas.length > 0) {
    await PlayerShopCommissionLog.destroy({ where: { id_encomenda: encomendasCriadas } });
    await PlayerShopCommissionOffer.destroy({ where: { id_encomenda: encomendasCriadas } });
    await PlayerShopCommission.destroy({ where: { id: encomendasCriadas } });
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
    nome: `Item Concorrência ${sufixo()}`,
    descricao: "Teste de concorrência.",
    tipo_item: "Material",
    raridade: "Comum",
    negociavel_mercado: true,
  });
  itensCriados.push(item.id);
  return item;
}

testeComBanco(
  "concorrência: duas entregas simultâneas na MESMA demanda nunca ultrapassam o restante nem pagam ouro a mais",
  async () => {
    const { personagem: lojista } = await novoPersonagem();
    const { personagem: fornecedorA } = await novoPersonagem();
    const { personagem: fornecedorB } = await novoPersonagem();
    const item = await novoItemEstocavel();

    await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}` });
    lojista.dinheiro = 1000;
    await lojista.save();
    // Só restam 10 unidades pra pedir — dois fornecedores tentam entregar
    // 10 cada um ao mesmo tempo (o cenário clássico de "o último pedaço").
    await CharacterInventory.create({ id_personagem: fornecedorA.id, id_item: item.id, quantidade: 10 });
    await CharacterInventory.create({ id_personagem: fornecedorB.id, id_item: item.id, quantidade: 10 });

    const demanda = await playerShopDemandService.criarDemanda(lojista.id, {
      id_item: item.id,
      quantidade: 10,
      preco_unitario: 5,
    });
    demandasCriadas.push(demanda.id);

    const resultados = await Promise.allSettled([
      playerShopDemandService.entregarItem(demanda.id, fornecedorA.id, 10),
      playerShopDemandService.entregarItem(demanda.id, fornecedorB.id, 10),
    ]);

    const sucesso = resultados.filter((r) => r.status === "fulfilled");
    const falha = resultados.filter((r) => r.status === "rejected");
    assert.equal(sucesso.length, 1, "só UMA das duas entregas de 10 pode ter sucesso — a demanda só pedia 10 no total");
    assert.equal(falha.length, 1);

    const demandaFinal = await PlayerShopDemand.findByPk(demanda.id);
    assert.equal(demandaFinal.quantidade_entregue, 10, "nunca pode passar de quantidade_desejada mesmo sob corrida");
    assert.equal(demandaFinal.status, "Concluida");
    assert.equal(demandaFinal.ouro_reservado, 0, "ouro reservado tem que fechar em zero, nunca negativo");

    // O ouro pago (10*5=50) foi pra UM dos dois fornecedores, nunca pros
    // dois — senão o lojista teria pago 100 por uma demanda de 50.
    const fA = await Character.findByPk(fornecedorA.id);
    const fB = await Character.findByPk(fornecedorB.id);
    const totalRecebido = fA.dinheiro + fB.dinheiro;
    assert.equal(totalRecebido, 50, "o total pago aos fornecedores nunca pode passar do que estava reservado (50)");
  },
);

testeComBanco(
  "concorrência: duas tentativas de aceitar a MESMA oferta não debitam o cliente duas vezes",
  async () => {
    const { personagem: lojista } = await novoPersonagem();
    const { personagem: cliente } = await novoPersonagem();
    const item = await novoItemEstocavel();

    await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}`, aceita_encomendas: true });
    cliente.dinheiro = 1000;
    await cliente.save();

    const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
      id_item: item.id,
      quantidade: 2,
      preco_unitario: 50,
      prazo_entrega_dias: 1,
    });
    encomendasCriadas.push(encomenda.id);

    // É a vez do lojista responder à proposta v1 do cliente — duas
    // "abas" do lojista tentando aceitar ao mesmo tempo.
    const resultados = await Promise.allSettled([
      playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 1),
      playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 1),
    ]);

    const sucesso = resultados.filter((r) => r.status === "fulfilled");
    const falha = resultados.filter((r) => r.status === "rejected");
    assert.equal(sucesso.length, 1, "só UM aceite pode vingar pra mesma oferta — o segundo tem que achar status != negociando");
    assert.equal(falha.length, 1);

    const clienteFinal = await Character.findByPk(cliente.id);
    assert.equal(clienteFinal.dinheiro, 900, "100 (2*50) debitados UMA ÚNICA vez, nunca 200");

    const encomendaFinal = await PlayerShopCommission.findByPk(encomenda.id);
    assert.equal(encomendaFinal.status, "Aceita");
    assert.equal(encomendaFinal.ouro_reservado, 100);
  },
);

testeComBanco(
  "concorrência: aceitar e contrapropor ao mesmo tempo na mesma versão — só um dos dois pode mudar o estado",
  async () => {
    const { personagem: lojista } = await novoPersonagem();
    const { personagem: cliente } = await novoPersonagem();
    const item = await novoItemEstocavel();

    await playerShopService.criarOuAtualizarLoja(lojista.id, { nome: `Loja ${sufixo()}`, aceita_encomendas: true });
    cliente.dinheiro = 1000;
    await cliente.save();

    const encomenda = await playerShopCommissionService.criarEncomenda(cliente.id, lojista.id, {
      id_item: item.id,
      quantidade: 1,
      preco_unitario: 30,
      prazo_entrega_dias: 1,
    });
    encomendasCriadas.push(encomenda.id);

    const resultados = await Promise.allSettled([
      playerShopCommissionService.aceitarOferta(encomenda.id, lojista.id, 1),
      playerShopCommissionService.contraPropor(encomenda.id, lojista.id, { quantidade: 1, preco_unitario: 40, prazo_entrega_dias: 1 }),
    ]);

    const sucesso = resultados.filter((r) => r.status === "fulfilled");
    assert.equal(sucesso.length, 1, "aceitar e contrapropor concorrentes na mesma oferta: só um pode vencer");

    const encomendaFinal = await PlayerShopCommission.findByPk(encomenda.id);
    // Ou ficou Aceita (aceite venceu) ou ficou com v2 aguardando o
    // cliente (contraproposta venceu) — nunca os dois nem nenhum.
    assert.ok(
      encomendaFinal.status === "Aceita" || (encomendaFinal.status === "AguardandoCliente" && encomendaFinal.proposal_version === 2),
      `estado inesperado após corrida: ${encomendaFinal.status} v${encomendaFinal.proposal_version}`,
    );
  },
);
