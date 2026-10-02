// Loja do Aventureiro V2 §6 — Demanda: o lojista PUBLICA UMA COMPRA
// (quer receber um item de outros jogadores). Ouro é reservado
// (debitado) INTEIRO na criação — nunca na entrega — e cada entrega
// paga o fornecedor direto (P2P, nunca goldService.concederOuro, pois
// o ouro já existia e só está trocando de dono). Reaproveita
// addStack/removeStack (inventoryService) — nenhum inventário paralelo.
//
// Ordem de locks (doc §21, pra nunca dar deadlock): Demanda → Characters
// (ordem crescente de id quando dois precisam travar) → InventoryEntry →
// registro de entrega → status final.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Item = require("../models/Item");
const PlayerShopDemand = require("../models/PlayerShopDemand");
const PlayerShopDemandDelivery = require("../models/PlayerShopDemandDelivery");
const PlayerShop = require("../models/PlayerShop");
const equipmentInstanceService = require("./equipmentInstanceService");
const { addStack, removeStack } = require("./inventoryService");
const adminPlayerShopConfigService = require("./adminPlayerShopConfigService");

const LIMITE_PAGINA_PADRAO = 20;
const LIMITE_PAGINA_MAXIMO = 50;

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

async function criarDemanda(idPersonagem, { id_item, quantidade, preco_unitario, prazo_dias } = {}) {
  adminPlayerShopConfigService.verificarAtivo();

  const precoMinimo = adminPlayerShopConfigService.obter("playershop.precoMinimoUnitario");
  const precoMaximo = adminPlayerShopConfigService.obter("playershop.precoMaximoUnitario");
  const quantidadeMaxima = adminPlayerShopConfigService.obter("playershop.quantidadeMaxima");
  const prazoMinimoDias = adminPlayerShopConfigService.obter("playershop.prazoDemandaMinimoDias");
  const prazoMaximoDias = adminPlayerShopConfigService.obter("playershop.prazoDemandaMaximoDias");
  const prazoPadraoDias = adminPlayerShopConfigService.obter("playershop.prazoDemandaPadraoDias");

  const idItem = Number(id_item);
  const qtd = Number(quantidade);
  const preco = Number(preco_unitario);
  const prazoDias = prazo_dias !== undefined ? Number(prazo_dias) : prazoPadraoDias;

  if (!Number.isInteger(idItem)) throw erro("id_item é obrigatório.");
  if (!Number.isInteger(qtd) || qtd <= 0 || qtd > quantidadeMaxima) {
    throw erro(`Quantidade deve ser um inteiro entre 1 e ${quantidadeMaxima}.`);
  }
  if (!Number.isInteger(preco) || preco < precoMinimo || preco > precoMaximo) {
    throw erro(`Preço unitário deve estar entre ${precoMinimo} e ${precoMaximo}.`);
  }
  if (!Number.isInteger(prazoDias) || prazoDias < prazoMinimoDias || prazoDias > prazoMaximoDias) {
    throw erro(`Prazo deve ser entre ${prazoMinimoDias} e ${prazoMaximoDias} dias.`);
  }

  return sequelize.transaction(async (transaction) => {
    const loja = await PlayerShop.findOne({ where: { id_personagem: idPersonagem }, transaction });
    if (!loja) throw erro("Crie sua loja antes de publicar uma demanda.");

    const item = await Item.findByPk(idItem, { transaction });
    if (!item) throw erro("Item não encontrado.", 404);
    if (["QuestItem", "Currencia"].includes(item.tipo_item)) {
      throw erro(`Item do tipo "${item.tipo_item}" não pode ser demandado.`);
    }
    if (equipmentInstanceService.ehInstanciavel(item.tipo_item)) {
      throw erro("Equipamento não pode ser alvo de demanda (use Encomenda para isso).");
    }

    const lojista = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
    if (!lojista) throw erro("Personagem não encontrado.", 404);

    const total = qtd * preco;
    if (lojista.dinheiro < total) {
      throw erro("Moedas insuficientes para reservar esta demanda.");
    }

    lojista.dinheiro -= total;
    await lojista.save({ transaction });

    const prazoExpiracao = new Date(Date.now() + prazoDias * 24 * 60 * 60 * 1000);

    return PlayerShopDemand.create(
      {
        id_personagem: idPersonagem,
        id_item: idItem,
        quantidade_desejada: qtd,
        quantidade_entregue: 0,
        preco_unitario: preco,
        ouro_reservado: total,
        status: "Aberta",
        prazo_expiracao: prazoExpiracao,
      },
      { transaction },
    );
  });
}

function estaExpirada(demanda) {
  return demanda.status === "Aberta" && demanda.prazo_expiracao.getTime() <= Date.now();
}

// Expira (e reembolsa o que restar de ouro_reservado) uma demanda cujo
// prazo já passou. Idempotente: só mexe se ainda estiver "Aberta".
async function expirarSeNecessario(demanda, transaction) {
  if (demanda.status !== "Aberta" || !estaExpirada(demanda)) return demanda;

  const lojista = await Character.findByPk(demanda.id_personagem, { transaction, lock: transaction.LOCK.UPDATE });
  if (lojista && demanda.ouro_reservado > 0) {
    lojista.dinheiro += demanda.ouro_reservado;
    await lojista.save({ transaction });
  }
  demanda.ouro_reservado = 0;
  demanda.status = "Expirada";
  await demanda.save({ transaction });
  return demanda;
}

async function entregarItem(idDemanda, idPersonagemFornecedor, quantidadeEntregue) {
  const qtd = Number(quantidadeEntregue);
  if (!Number.isInteger(qtd) || qtd <= 0) {
    throw erro("Quantidade a entregar deve ser um inteiro positivo.");
  }

  return sequelize.transaction(async (transaction) => {
    const demanda = await PlayerShopDemand.findByPk(idDemanda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!demanda) throw erro("Demanda não encontrada.", 404);

    await expirarSeNecessario(demanda, transaction);
    if (demanda.status !== "Aberta") {
      throw erro("Esta demanda não está mais aberta para entregas.", 409);
    }
    if (demanda.id_personagem === idPersonagemFornecedor) {
      throw erro("Você não pode entregar itens pra sua própria demanda.");
    }

    const restante = demanda.quantidade_desejada - demanda.quantidade_entregue;
    if (qtd > restante) {
      throw erro(`Esta demanda só precisa de mais ${restante} unidade(s).`);
    }

    // Trava os dois personagens sempre na mesma ordem (id menor
    // primeiro) — evita deadlock com entregas concorrentes em papéis
    // invertidos entre os dois mesmos personagens.
    const [primeiroId, segundoId] = [demanda.id_personagem, idPersonagemFornecedor].sort((a, b) => a - b);
    const primeiro = await Character.findByPk(primeiroId, { transaction, lock: transaction.LOCK.UPDATE });
    const segundo = await Character.findByPk(segundoId, { transaction, lock: transaction.LOCK.UPDATE });
    const fornecedor = primeiroId === idPersonagemFornecedor ? primeiro : segundo;
    if (!fornecedor) throw erro("Personagem não encontrado.", 404);

    await removeStack(idPersonagemFornecedor, demanda.id_item, qtd, transaction);
    await addStack(demanda.id_personagem, demanda.id_item, qtd, transaction);

    const valorPago = qtd * demanda.preco_unitario;
    // Ouro de demanda já estava reservado (debitado do lojista na
    // criação) — isto é só liberar o que já existia pro fornecedor,
    // nunca goldService.concederOuro.
    fornecedor.dinheiro += valorPago;
    await fornecedor.save({ transaction });

    demanda.quantidade_entregue += qtd;
    demanda.ouro_reservado -= valorPago;
    if (demanda.quantidade_entregue >= demanda.quantidade_desejada) {
      demanda.status = "Concluida";
      demanda.concluido_em = new Date();
    }
    await demanda.save({ transaction });

    const entrega = await PlayerShopDemandDelivery.create(
      {
        id_demanda: demanda.id,
        id_personagem_fornecedor: idPersonagemFornecedor,
        quantidade: qtd,
        valor_pago: valorPago,
      },
      { transaction },
    );

    return { demanda, entrega };
  });
}

// Cancelamento pelo próprio lojista — idempotente: só reembolsa (e só
// muda status) se ainda estiver "Aberta"; chamar duas vezes nunca
// credita ouro duas vezes.
async function cancelarDemanda(idDemanda, idPersonagem) {
  return sequelize.transaction(async (transaction) => {
    const demanda = await PlayerShopDemand.findByPk(idDemanda, { transaction, lock: transaction.LOCK.UPDATE });
    if (!demanda) throw erro("Demanda não encontrada.", 404);
    if (demanda.id_personagem !== idPersonagem) throw erro("Esta demanda não é sua.", 403);
    if (demanda.status !== "Aberta") throw erro("Esta demanda não está mais aberta.", 409);

    const lojista = await Character.findByPk(idPersonagem, { transaction, lock: transaction.LOCK.UPDATE });
    if (lojista && demanda.ouro_reservado > 0) {
      lojista.dinheiro += demanda.ouro_reservado;
      await lojista.save({ transaction });
    }
    demanda.ouro_reservado = 0;
    demanda.status = "Cancelada";
    demanda.cancelado_em = new Date();
    await demanda.save({ transaction });
    return demanda;
  });
}

async function listarMinhasDemandas(idPersonagem) {
  return PlayerShopDemand.findAll({
    where: { id_personagem: idPersonagem },
    include: [{ model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] }],
    order: [["createdAt", "DESC"]],
  });
}

async function listarDemandasAbertas({ idItem, page, limit } = {}) {
  const porPagina = Math.min(Number(limit) || LIMITE_PAGINA_PADRAO, LIMITE_PAGINA_MAXIMO);
  const pagina = Math.max(Number(page) || 1, 1);
  const where = { status: "Aberta" };
  if (idItem) where.id_item = Number(idItem);

  const { rows, count } = await PlayerShopDemand.findAndCountAll({
    where,
    include: [
      { model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] },
      { model: Character, as: "lojista", attributes: ["id", "nome"] },
    ],
    order: [["createdAt", "DESC"]],
    limit: porPagina,
    offset: (pagina - 1) * porPagina,
  });

  return { demandas: rows, total: count, pagina, porPagina };
}

module.exports = {
  criarDemanda,
  entregarItem,
  cancelarDemanda,
  listarMinhasDemandas,
  listarDemandasAbertas,
  expirarSeNecessario,
};
