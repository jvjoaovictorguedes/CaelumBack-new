// Painel Administrativo — "Mercado P2P": moderar anúncios ativos e
// consultar histórico de vendas. Reaproveita os mesmos models/services
// do Mercado (MarketListing/MarketTransaction, addStack,
// equipmentInstanceService.releaseFromMarket) — cancelamento aqui é o
// MESMO fluxo de marketController.cancelarAnuncio, só sem a checagem
// de dono (admin pode cancelar QUALQUER anúncio) e com motivo
// obrigatório + auditoria, igual todo outro admin write.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Item = require("../models/Item");
const Character = require("../models/Character");
const MarketListing = require("../models/MarketListing");
const MarketTransaction = require("../models/MarketTransaction");
const { addStack } = require("./inventoryService");
const equipmentInstanceService = require("./equipmentInstanceService");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

const INCLUDE_LISTING = [
  { model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] },
  { model: Character, as: "vendedor", attributes: ["id", "nome"] },
  { model: Character, as: "comprador", attributes: ["id", "nome"] },
];

async function listAdminMarketListings({ pagina = 1, porPagina = 20, status, idItem, vendedorId } = {}) {
  const where = {};
  if (status) where.status = status;
  if (idItem) where.id_item = idItem;
  if (vendedorId) where.id_personagem_vendedor = vendedorId;

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await MarketListing.findAndCountAll({
    where,
    include: INCLUDE_LISTING,
    order: [["id", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function cancelAdminMarketListing(idListing, { idAdmin, motivo, req }) {
  if (!motivo || !motivo.trim()) throw erro("motivo é obrigatório — todo cancelamento fica registrado na auditoria com o porquê.");

  return sequelize.transaction(async (transaction) => {
    const listing = await MarketListing.findByPk(idListing, { transaction, lock: transaction.LOCK.UPDATE });
    if (!listing) throw erro("Anúncio não encontrado.", 404);
    if (listing.status !== "Ativo") throw erro("Este anúncio não está mais ativo.", 400);

    const antes = listing.toJSON();

    // Devolve só o que RESTOU anunciado — o que já foi vendido a outros
    // compradores já saiu da mão do vendedor e não volta (mesma regra
    // de marketController.cancelarAnuncio).
    if (listing.id_instancia) {
      await equipmentInstanceService.releaseFromMarket(listing.id_instancia, transaction);
    } else if (listing.quantidade_restante > 0) {
      await addStack(listing.id_personagem_vendedor, listing.id_item, listing.quantidade_restante, transaction);
    }

    listing.status = "Cancelado";
    listing.cancelado_em = new Date();
    await listing.save({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "cancelar",
      entidade: "MarketListing",
      idEntidade: listing.id,
      dadosAntes: antes,
      dadosDepois: listing.toJSON(),
      motivo,
      req,
      transaction,
    });

    return listing;
  });
}

async function listAdminMarketTransactions({ pagina = 1, porPagina = 20, idItem, vendedorId, compradorId } = {}) {
  const where = {};
  if (idItem) where.id_item = idItem;
  if (vendedorId) where.id_personagem_vendedor = vendedorId;
  if (compradorId) where.id_personagem_comprador = compradorId;

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await MarketTransaction.findAndCountAll({
    where,
    include: [
      { model: Item, as: "item", attributes: ["id", "nome", "raridade", "imagem_url"] },
      { model: Character, as: "vendedor", attributes: ["id", "nome"] },
      { model: Character, as: "comprador", attributes: ["id", "nome"] },
    ],
    order: [["id", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

module.exports = {
  listAdminMarketListings,
  cancelAdminMarketListing,
  listAdminMarketTransactions,
};
