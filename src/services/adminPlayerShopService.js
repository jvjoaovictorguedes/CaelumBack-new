// Painel Administrativo — Loja do Aventureiro V2 §19: moderação de
// lojas/demandas/encomendas. Cancelamentos aqui reaproveitam o MESMO
// reembolso idempotente que o jogador usaria (playerShopDemandService/
// playerShopCommissionService) — só sem a checagem de dono (admin pode
// agir em QUALQUER demanda/encomenda) e com motivo obrigatório +
// auditoria, igual todo outro admin write (mesmo padrão de
// adminMarketService.cancelAdminMarketListing).
const Character = require("../models/Character");
const Item = require("../models/Item");
const PlayerShop = require("../models/PlayerShop");
const PlayerShopDemand = require("../models/PlayerShopDemand");
const PlayerShopCommission = require("../models/PlayerShopCommission");
const playerShopDemandService = require("./playerShopDemandService");
const playerShopCommissionService = require("./playerShopCommissionService");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function exigirMotivo(motivo) {
  if (!motivo || !motivo.trim()) {
    throw erro('motivo é obrigatório — todo cancelamento administrativo fica registrado na auditoria com o porquê.');
  }
}

async function listarLojasAdmin({ pagina = 1, porPagina = 20, ativa } = {}) {
  const where = {};
  if (ativa !== undefined) where.ativa = ativa;

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);

  const { count, rows } = await PlayerShop.findAndCountAll({
    where,
    include: [{ model: Character, as: "personagem", attributes: ["id", "nome"] }],
    order: [["id", "DESC"]],
    limit: limite,
    offset: (paginaAtual - 1) * limite,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function listarDemandasAdmin({ pagina = 1, porPagina = 20, status } = {}) {
  const where = {};
  if (status) where.status = status;

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);

  const { count, rows } = await PlayerShopDemand.findAndCountAll({
    where,
    include: [
      { model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] },
      { model: Character, as: "lojista", attributes: ["id", "nome"] },
    ],
    order: [["id", "DESC"]],
    limit: limite,
    offset: (paginaAtual - 1) * limite,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function listarEncomendasAdmin({ pagina = 1, porPagina = 20, status } = {}) {
  const where = {};
  if (status) where.status = status;

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);

  const { count, rows } = await PlayerShopCommission.findAndCountAll({
    where,
    include: [
      { model: Item, as: "item", attributes: ["id", "nome", "tipo_item", "raridade"] },
      { model: Character, as: "lojista", attributes: ["id", "nome"] },
      { model: Character, as: "cliente", attributes: ["id", "nome"] },
    ],
    order: [["id", "DESC"]],
    limit: limite,
    offset: (paginaAtual - 1) * limite,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function cancelarDemandaAdmin(idDemanda, { idAdmin, motivo, req }) {
  exigirMotivo(motivo);
  const demanda = await PlayerShopDemand.findByPk(idDemanda);
  if (!demanda) throw erro("Demanda não encontrada.", 404);
  const antes = demanda.toJSON();

  // Mesmo reembolso idempotente que o jogador usaria — só sem a
  // checagem de dono (o service exige id_personagem === idPersonagem).
  const resultado = await playerShopDemandService.cancelarDemanda(idDemanda, demanda.id_personagem);

  await registrarAcao({
    idAdmin,
    acao: "cancelar",
    entidade: "PlayerShopDemand",
    idEntidade: idDemanda,
    dadosAntes: antes,
    dadosDepois: resultado.toJSON(),
    motivo,
    req,
  });
  return resultado;
}

async function cancelarEncomendaAdmin(idEncomenda, { idAdmin, motivo, req }) {
  exigirMotivo(motivo);
  const encomenda = await PlayerShopCommission.findByPk(idEncomenda);
  if (!encomenda) throw erro("Encomenda não encontrada.", 404);
  const antes = encomenda.toJSON();

  // Antes do aceite (negociando) usa recusar(); depois do aceite (termos
  // já travados/ouro já reservado) usa cancelarAposAceite() — mesmos
  // dois fluxos que os próprios jogadores usariam, reembolso idempotente
  // incluso.
  const emNegociacao = ["AguardandoLojista", "AguardandoCliente"].includes(encomenda.status);
  const resultado = emNegociacao
    ? await playerShopCommissionService.recusar(idEncomenda, encomenda.id_personagem_lojista)
    : await playerShopCommissionService.cancelarAposAceite(idEncomenda, encomenda.id_personagem_lojista);

  await registrarAcao({
    idAdmin,
    acao: "cancelar",
    entidade: "PlayerShopCommission",
    idEntidade: idEncomenda,
    dadosAntes: antes,
    dadosDepois: resultado.toJSON(),
    motivo,
    req,
  });
  return resultado;
}

async function desativarLojaAdmin(idPersonagem, { idAdmin, motivo, req }) {
  exigirMotivo(motivo);
  const loja = await PlayerShop.findOne({ where: { id_personagem: idPersonagem } });
  if (!loja) throw erro("Esse personagem não tem uma loja.", 404);
  const antes = loja.toJSON();

  loja.ativa = false;
  await loja.save();

  await registrarAcao({
    idAdmin,
    acao: "desativar",
    entidade: "PlayerShop",
    idEntidade: loja.id,
    dadosAntes: antes,
    dadosDepois: loja.toJSON(),
    motivo,
    req,
  });
  return loja;
}

module.exports = {
  listarLojasAdmin,
  listarDemandasAdmin,
  listarEncomendasAdmin,
  cancelarDemandaAdmin,
  cancelarEncomendaAdmin,
  desativarLojaAdmin,
};
