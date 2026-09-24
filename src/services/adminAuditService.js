// Painel Administrativo §44/§54 — log imutável de toda ação
// administrativa sensível. Escrito na MESMA transaction da operação
// quando possível (§54), pra nunca existir uma mudança de dado sem o
// registro correspondente (ou nenhum dos dois, se a transaction
// rolback).
const AdminActionLog = require("../models/AdminActionLog");

async function registrarAcao({
  idAdmin,
  acao,
  entidade,
  idEntidade = null,
  dadosAntes = null,
  dadosDepois = null,
  motivo = null,
  req = null,
  transaction,
}) {
  return AdminActionLog.create(
    {
      id_admin: idAdmin,
      acao,
      entidade,
      id_entidade: idEntidade,
      dados_antes: dadosAntes,
      dados_depois: dadosDepois,
      motivo,
      ip: req?.ip ?? null,
      user_agent: req?.get?.("user-agent") ?? null,
    },
    { transaction },
  );
}

async function listarAcoes({ pagina = 1, porPagina = 20, idAdmin, entidade, acao } = {}) {
  const where = {};
  if (idAdmin) where.id_admin = idAdmin;
  if (entidade) where.entidade = entidade;
  if (acao) where.acao = acao;

  const limite = Math.min(100, Math.max(1, porPagina));
  const offset = (Math.max(1, pagina) - 1) * limite;

  const { count, rows } = await AdminActionLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina, porPagina: limite, itens: rows };
}

module.exports = { registrarAcao, listarAcoes };
