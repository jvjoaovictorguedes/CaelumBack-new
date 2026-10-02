// Loja do Aventureiro V2 §7 — Encomenda: negociação DIRECIONADA entre
// cliente e lojista. Máquina de estados:
//   AguardandoLojista/AguardandoCliente (alterna conforme quem fez a
//   última Offer) → Aceita (termos congelados, escrow acontece
//   EXATAMENTE aqui) → ProntaEntrega (opcional, Fase 7) →
//   Concluida/Recusada/Cancelada/Expirada.
// Cada Offer é imutável e versionada (proposal_version); aceitar
// revalida status + proposal_version JUNTOS — nunca deixa aceitar uma
// proposta já superada sob concorrência (duas abas, F5 numa hora ruim).
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const PlayerShop = require("../models/PlayerShop");
const PlayerShopCommission = require("../models/PlayerShopCommission");
const PlayerShopCommissionOffer = require("../models/PlayerShopCommissionOffer");
const PlayerShopCommissionLog = require("../models/PlayerShopCommissionLog");
const equipmentInstanceService = require("./equipmentInstanceService");
const { addStack, removeStack } = require("./inventoryService");

const TAXA_ENCOMENDA = 0.08;
const PRECO_MINIMO_UNITARIO = 1;
const PRECO_MAXIMO_UNITARIO = 1_000_000;
const QUANTIDADE_MAXIMA = 999_999;
const PRAZO_ENTREGA_MINIMO_DIAS = 1;
const PRAZO_ENTREGA_MAXIMO_DIAS = 60;
const PRAZO_NEGOCIACAO_DIAS = 3;

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

function validarTermos({ quantidade, preco_unitario, prazo_entrega_dias }) {
  const qtd = Number(quantidade);
  const preco = Number(preco_unitario);
  const prazo = Number(prazo_entrega_dias);

  if (!Number.isInteger(qtd) || qtd <= 0 || qtd > QUANTIDADE_MAXIMA) {
    throw erro(`Quantidade deve ser um inteiro entre 1 e ${QUANTIDADE_MAXIMA}.`);
  }
  if (!Number.isInteger(preco) || preco < PRECO_MINIMO_UNITARIO || preco > PRECO_MAXIMO_UNITARIO) {
    throw erro(`Preço unitário deve estar entre ${PRECO_MINIMO_UNITARIO} e ${PRECO_MAXIMO_UNITARIO}.`);
  }
  if (!Number.isInteger(prazo) || prazo < PRAZO_ENTREGA_MINIMO_DIAS || prazo > PRAZO_ENTREGA_MAXIMO_DIAS) {
    throw erro(`Prazo de entrega deve ser entre ${PRAZO_ENTREGA_MINIMO_DIAS} e ${PRAZO_ENTREGA_MAXIMO_DIAS} dias.`);
  }
  return { qtd, preco, prazo };
}

async function registrarLog(idEncomenda, evento, detalhes, transaction) {
  return PlayerShopCommissionLog.create({ id_encomenda: idEncomenda, evento, detalhes }, { transaction });
}

async function criarEncomenda(
  idPersonagemCliente,
  idPersonagemLojista,
  { id_item, quantidade, preco_unitario, prazo_entrega_dias, mensagem, descricao } = {},
) {
  const idItem = Number(id_item);
  const idLojista = Number(idPersonagemLojista);
  if (!Number.isInteger(idItem)) throw erro("id_item é obrigatório.");
  if (idLojista === idPersonagemCliente) throw erro("Você não pode encomendar de si mesmo.");

  const { qtd, preco, prazo } = validarTermos({ quantidade, preco_unitario, prazo_entrega_dias });

  return sequelize.transaction(async (transaction) => {
    const loja = await PlayerShop.findOne({ where: { id_personagem: idLojista }, transaction });
    if (!loja || !loja.ativa) throw erro("Esta loja não está disponível.", 404);
    if (!loja.aceita_encomendas) throw erro("Esta loja não está aceitando encomendas no momento.");

    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    if (["QuestItem", "Currencia"].includes(item.tipo_item)) {
      throw erro(`Item do tipo "${item.tipo_item}" não pode ser encomendado.`);
    }
    if (equipmentInstanceService.ehInstanciavel(item.tipo_item) && qtd !== 1) {
      throw erro("Equipamento é encomendado um de cada vez (quantidade deve ser 1).");
    }

    const prazoNegociacao = new Date(Date.now() + PRAZO_NEGOCIACAO_DIAS * 24 * 60 * 60 * 1000);
    const encomenda = await PlayerShopCommission.create(
      {
        id_personagem_lojista: idLojista,
        id_personagem_cliente: idPersonagemCliente,
        id_item: idItem,
        descricao: descricao != null ? String(descricao).trim() : null,
        status: "AguardandoLojista",
        proposal_version: 1,
        prazo_negociacao: prazoNegociacao,
      },
      { transaction },
    );

    await PlayerShopCommissionOffer.create(
      {
        id_encomenda: encomenda.id,
        proposal_version: 1,
        autor: "Cliente",
        quantidade: qtd,
        preco_unitario: preco,
        prazo_entrega_dias: prazo,
        mensagem: mensagem != null ? String(mensagem).trim() : null,
        status: "Pendente",
      },
      { transaction },
    );

    await registrarLog(encomenda.id, "criada", { quantidade: qtd, preco_unitario: preco }, transaction);
    return encomenda;
  });
}

function estaExpirada(encomenda) {
  return (
    ["AguardandoLojista", "AguardandoCliente"].includes(encomenda.status) &&
    encomenda.prazo_negociacao.getTime() <= Date.now()
  );
}

async function expirarSeNecessario(encomenda, transaction) {
  if (!estaExpirada(encomenda)) return encomenda;
  encomenda.status = "Expirada";
  await encomenda.save({ transaction });
  await PlayerShopCommissionOffer.update(
    { status: "Recusada" },
    { where: { id_encomenda: encomenda.id, status: "Pendente" }, transaction },
  );
  await registrarLog(encomenda.id, "expirada", null, transaction);
  return encomenda;
}

function papelDoPersonagem(encomenda, idPersonagem) {
  if (idPersonagem === encomenda.id_personagem_lojista) return "Lojista";
  if (idPersonagem === encomenda.id_personagem_cliente) return "Cliente";
  return null;
}

function vezDeQuem(status) {
  if (status === "AguardandoLojista") return "Lojista";
  if (status === "AguardandoCliente") return "Cliente";
  return null;
}

async function contraPropor(idEncomenda, idPersonagem, { quantidade, preco_unitario, prazo_entrega_dias, mensagem } = {}) {
  const { qtd, preco, prazo } = validarTermos({ quantidade, preco_unitario, prazo_entrega_dias });

  return sequelize.transaction(async (transaction) => {
    const encomenda = await PlayerShopCommission.findByPk(idEncomenda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!encomenda) throw erro("Encomenda não encontrada.", 404);
    await expirarSeNecessario(encomenda, transaction);

    const papel = papelDoPersonagem(encomenda, idPersonagem);
    if (!papel) throw erro("Esta encomenda não é sua.", 403);
    if (!["AguardandoLojista", "AguardandoCliente"].includes(encomenda.status)) {
      throw erro("Esta encomenda não está mais em negociação.", 409);
    }
    if (vezDeQuem(encomenda.status) !== papel) {
      throw erro("Agora é a vez da outra parte responder.", 409);
    }

    await PlayerShopCommissionOffer.update(
      { status: "Superada" },
      { where: { id_encomenda: encomenda.id, proposal_version: encomenda.proposal_version, status: "Pendente" }, transaction },
    );

    const novaVersao = encomenda.proposal_version + 1;
    const novaOferta = await PlayerShopCommissionOffer.create(
      {
        id_encomenda: encomenda.id,
        proposal_version: novaVersao,
        autor: papel,
        quantidade: qtd,
        preco_unitario: preco,
        prazo_entrega_dias: prazo,
        mensagem: mensagem != null ? String(mensagem).trim() : null,
        status: "Pendente",
      },
      { transaction },
    );

    encomenda.proposal_version = novaVersao;
    encomenda.status = papel === "Lojista" ? "AguardandoCliente" : "AguardandoLojista";
    await encomenda.save({ transaction });
    await registrarLog(encomenda.id, "contraproposta", { proposal_version: novaVersao, quantidade: qtd, preco_unitario: preco }, transaction);

    return { encomenda, oferta: novaOferta };
  });
}

// Aceite: trava a Encomenda, revalida status + proposal_version JUNTOS
// contra o que o cliente viu na tela (evita aceitar oferta já superada
// sob concorrência), congela os termos e reserva o ouro do cliente
// EXATAMENTE aqui — nunca de novo depois.
async function aceitarOferta(idEncomenda, idPersonagem, proposalVersionEsperada) {
  return sequelize.transaction(async (transaction) => {
    const encomenda = await PlayerShopCommission.findByPk(idEncomenda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!encomenda) throw erro("Encomenda não encontrada.", 404);
    await expirarSeNecessario(encomenda, transaction);

    const papel = papelDoPersonagem(encomenda, idPersonagem);
    if (!papel) throw erro("Esta encomenda não é sua.", 403);
    if (!["AguardandoLojista", "AguardandoCliente"].includes(encomenda.status)) {
      throw erro("Esta encomenda não está mais em negociação.", 409);
    }
    if (vezDeQuem(encomenda.status) !== papel) {
      throw erro("Agora é a vez da outra parte responder — você não pode aceitar sua própria proposta.", 409);
    }
    if (Number(proposalVersionEsperada) !== encomenda.proposal_version) {
      throw erro("Esta proposta já foi superada por uma mais recente. Recarregue e tente de novo.", 409);
    }

    const oferta = await PlayerShopCommissionOffer.findOne({
      where: { id_encomenda: encomenda.id, proposal_version: encomenda.proposal_version, status: "Pendente" },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!oferta) throw erro("Proposta não encontrada ou já processada.", 409);

    const precoTotal = oferta.quantidade * oferta.preco_unitario;

    const [primeiroId, segundoId] = [encomenda.id_personagem_cliente, encomenda.id_personagem_lojista].sort((a, b) => a - b);
    const primeiro = await Character.findByPk(primeiroId, { transaction, lock: transaction.LOCK.UPDATE });
    const segundo = await Character.findByPk(segundoId, { transaction, lock: transaction.LOCK.UPDATE });
    const cliente = primeiroId === encomenda.id_personagem_cliente ? primeiro : segundo;
    if (!cliente) throw erro("Personagem não encontrado.", 404);
    if (cliente.dinheiro < precoTotal) {
      throw erro("O cliente não tem moedas suficientes pra reservar esta encomenda.");
    }

    cliente.dinheiro -= precoTotal;
    await cliente.save({ transaction });

    oferta.status = "Aceita";
    await oferta.save({ transaction });

    encomenda.quantidade_acordada = oferta.quantidade;
    encomenda.preco_unitario_acordado = oferta.preco_unitario;
    encomenda.preco_total_acordado = precoTotal;
    encomenda.ouro_reservado = precoTotal;
    encomenda.prazo_entrega = new Date(Date.now() + oferta.prazo_entrega_dias * 24 * 60 * 60 * 1000);
    encomenda.status = "Aceita";
    encomenda.aceito_em = new Date();
    await encomenda.save({ transaction });

    await registrarLog(encomenda.id, "aceita", { proposal_version: oferta.proposal_version, preco_total: precoTotal }, transaction);
    return encomenda;
  });
}

async function recusar(idEncomenda, idPersonagem) {
  return sequelize.transaction(async (transaction) => {
    const encomenda = await PlayerShopCommission.findByPk(idEncomenda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!encomenda) throw erro("Encomenda não encontrada.", 404);
    await expirarSeNecessario(encomenda, transaction);

    const papel = papelDoPersonagem(encomenda, idPersonagem);
    if (!papel) throw erro("Esta encomenda não é sua.", 403);
    if (!["AguardandoLojista", "AguardandoCliente"].includes(encomenda.status)) {
      throw erro("Esta encomenda não está mais em negociação.", 409);
    }

    await PlayerShopCommissionOffer.update(
      { status: "Recusada" },
      { where: { id_encomenda: encomenda.id, proposal_version: encomenda.proposal_version, status: "Pendente" }, transaction },
    );
    encomenda.status = "Recusada";
    encomenda.recusado_em = new Date();
    await encomenda.save({ transaction });
    await registrarLog(encomenda.id, "recusada", { por: papel }, transaction);
    return encomenda;
  });
}

// Entrega (Fase 7 — doc §8): transfere o item combinado do lojista pro
// cliente (stack via inventoryService, equipamento via a transferência
// DIRETA nova de equipmentInstanceService — nunca via reserveForMarket,
// a encomenda não precisa passar pelo Mercado) e SÓ DEPOIS liquida o
// financeiro: taxa calculada sobre o valor congelado no aceite, líquido
// creditado no lojista direto (P2P, nunca goldService.concederOuro),
// ouro_reservado zerado, status final. Ordem de locks: Encomenda ->
// Characters (ordem crescente de id) -> Item/InventoryEntry ou
// EquipmentInstance -> log -> status final.
async function entregarEncomenda(idEncomenda, idPersonagemLojista, { id_instancia } = {}) {
  return sequelize.transaction(async (transaction) => {
    const encomenda = await PlayerShopCommission.findByPk(idEncomenda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!encomenda) throw erro("Encomenda não encontrada.", 404);
    if (encomenda.id_personagem_lojista !== idPersonagemLojista) {
      throw erro("Só o lojista desta encomenda pode entregá-la.", 403);
    }
    if (encomenda.status !== "Aceita") {
      throw erro("Esta encomenda precisa estar Aceita (termos travados) antes de ser entregue.", 409);
    }

    const [primeiroId, segundoId] = [encomenda.id_personagem_cliente, encomenda.id_personagem_lojista].sort((a, b) => a - b);
    const primeiro = await Character.findByPk(primeiroId, { transaction, lock: transaction.LOCK.UPDATE });
    const segundo = await Character.findByPk(segundoId, { transaction, lock: transaction.LOCK.UPDATE });
    const lojista = primeiroId === idPersonagemLojista ? primeiro : segundo;
    if (!lojista) throw erro("Personagem não encontrado.", 404);

    const item = await Item.findByPk(encomenda.id_item, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);

    if (equipmentInstanceService.ehInstanciavel(item.tipo_item)) {
      if (!id_instancia) throw erro("id_instancia é obrigatório pra entregar este equipamento.");
      await equipmentInstanceService.transferDireto(idPersonagemLojista, id_instancia, encomenda.id_personagem_cliente, transaction);
      encomenda.id_instancia_acordada = id_instancia;
    } else {
      await removeStack(idPersonagemLojista, encomenda.id_item, encomenda.quantidade_acordada, transaction);
      await addStack(encomenda.id_personagem_cliente, encomenda.id_item, encomenda.quantidade_acordada, transaction);
    }

    const taxa = Math.floor(encomenda.ouro_reservado * TAXA_ENCOMENDA);
    const valorLiquido = encomenda.ouro_reservado - taxa;
    // Ouro da encomenda já estava reservado (debitado do cliente no
    // aceite) — isto é só liberar o líquido pro lojista, nunca
    // goldService.concederOuro.
    lojista.dinheiro += valorLiquido;
    await lojista.save({ transaction });

    encomenda.ouro_reservado = 0;
    encomenda.status = "Concluida";
    encomenda.concluido_em = new Date();
    await encomenda.save({ transaction });

    await registrarLog(encomenda.id, "entregue", { taxa, valor_liquido: valorLiquido }, transaction);
    return encomenda;
  });
}

// Cancelamento DEPOIS do aceite (antes da entrega) — reembolso integral
// pro cliente, já que nada foi entregue ainda. Idempotente: só mexe se
// ainda estiver "Aceita"; chamar duas vezes nunca credita 2x.
async function cancelarAposAceite(idEncomenda, idPersonagem) {
  return sequelize.transaction(async (transaction) => {
    const encomenda = await PlayerShopCommission.findByPk(idEncomenda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!encomenda) throw erro("Encomenda não encontrada.", 404);
    if (!papelDoPersonagem(encomenda, idPersonagem)) throw erro("Esta encomenda não é sua.", 403);
    if (encomenda.status !== "Aceita") {
      throw erro("Esta encomenda não está mais no estado Aceita (ou já foi entregue/cancelada).", 409);
    }

    const cliente = await Character.findByPk(encomenda.id_personagem_cliente, { transaction, lock: transaction.LOCK.UPDATE });
    if (cliente && encomenda.ouro_reservado > 0) {
      cliente.dinheiro += encomenda.ouro_reservado;
      await cliente.save({ transaction });
    }
    encomenda.ouro_reservado = 0;
    encomenda.status = "Cancelada";
    encomenda.cancelado_em = new Date();
    await encomenda.save({ transaction });
    await registrarLog(encomenda.id, "cancelada_apos_aceite", null, transaction);
    return encomenda;
  });
}

async function listarMinhasEncomendas(idPersonagem) {
  const [comoCliente, comoLojista] = await Promise.all([
    PlayerShopCommission.findAll({
      where: { id_personagem_cliente: idPersonagem },
      include: [{ model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] }],
      order: [["createdAt", "DESC"]],
    }),
    PlayerShopCommission.findAll({
      where: { id_personagem_lojista: idPersonagem },
      include: [{ model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] }],
      order: [["createdAt", "DESC"]],
    }),
  ]);
  return { enviadas: comoCliente, recebidas: comoLojista };
}

async function obterEncomenda(idEncomenda, idPersonagem) {
  const encomenda = await PlayerShopCommission.findByPk(idEncomenda, {
    include: [
      { model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] },
      { model: PlayerShopCommissionOffer, as: "ofertas", separate: true, order: [["proposal_version", "ASC"]] },
      { model: Character, as: "lojista", attributes: ["id", "nome"] },
      { model: Character, as: "cliente", attributes: ["id", "nome"] },
    ],
  });
  if (!encomenda) throw erro("Encomenda não encontrada.", 404);
  if (!papelDoPersonagem(encomenda, idPersonagem)) throw erro("Esta encomenda não é sua.", 403);
  return encomenda;
}

module.exports = {
  criarEncomenda,
  contraPropor,
  aceitarOferta,
  recusar,
  entregarEncomenda,
  cancelarAposAceite,
  listarMinhasEncomendas,
  obterEncomenda,
  expirarSeNecessario,
};
