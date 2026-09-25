// Painel Administrativo Fase 15 (permissão events.manage) — CRUD de
// Buff Global: evento temporal server-wide, some com GuildBuff (ver
// GlobalBuff.js) em vez de substituir. Múltiplos buffs do mesmo tipo
// podem se sobrepor no tempo — sem restrição de unicidade aqui, quem
// decide isso é o próprio admin ao criar o evento.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const GlobalBuff = require("../models/GlobalBuff");
const { TIPOS_VALIDOS } = require("./globalBuffService");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function validar(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.nome !== undefined) {
    if (!dados.nome || typeof dados.nome !== "string") erros.push("nome é obrigatório.");
  }
  if (!parcial || dados.tipo !== undefined) {
    if (!TIPOS_VALIDOS.includes(dados.tipo)) erros.push(`tipo precisa ser um de: ${TIPOS_VALIDOS.join(", ")}.`);
  }
  if (!parcial || dados.multiplicador_percentual !== undefined) {
    const valor = Number(dados.multiplicador_percentual);
    if (!Number.isFinite(valor) || valor <= 0) erros.push("multiplicador_percentual precisa ser um número positivo.");
  }
  if (!parcial || dados.inicio !== undefined) {
    if (Number.isNaN(Date.parse(dados.inicio))) erros.push("inicio precisa ser uma data válida.");
  }
  if (!parcial || dados.fim !== undefined) {
    if (Number.isNaN(Date.parse(dados.fim))) erros.push("fim precisa ser uma data válida.");
  }
  if (dados.inicio !== undefined && dados.fim !== undefined) {
    if (!Number.isNaN(Date.parse(dados.inicio)) && !Number.isNaN(Date.parse(dados.fim))) {
      if (new Date(dados.inicio) >= new Date(dados.fim)) erros.push("inicio precisa ser anterior a fim.");
    }
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function campos(dados) {
  const permitidos = ["nome", "tipo", "multiplicador_percentual", "inicio", "fim", "ativo", "descricao"];
  const out = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  return out;
}

async function listAdminGlobalBuffs({ pagina = 1, porPagina = 20, tipo, ativo, nome } = {}) {
  const where = {};
  if (tipo) where.tipo = tipo;
  if (ativo !== undefined && ativo !== "") where.ativo = ativo === true || ativo === "true";
  if (nome) where.nome = { [Op.iLike]: `%${nome}%` };

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await GlobalBuff.findAndCountAll({
    where,
    order: [["inicio", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function createAdminGlobalBuff(dados, { idAdmin, req }) {
  validar(dados);

  return sequelize.transaction(async (transaction) => {
    const buff = await GlobalBuff.create(
      {
        ...campos(dados),
        ativo: dados.ativo ?? true,
        id_admin_criador: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "GlobalBuff",
      idEntidade: buff.id,
      dadosDepois: buff.toJSON(),
      req,
      transaction,
    });

    return buff;
  });
}

async function updateAdminGlobalBuff(id, dados, { idAdmin, req }) {
  validar(dados, { parcial: true });

  return sequelize.transaction(async (transaction) => {
    const buff = await GlobalBuff.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!buff) throw erro("Buff Global não encontrado.", 404);

    const antes = buff.toJSON();
    await buff.update(campos(dados), { transaction });

    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "GlobalBuff",
      idEntidade: buff.id,
      dadosAntes: antes,
      dadosDepois: buff.toJSON(),
      req,
      transaction,
    });

    return buff;
  });
}

async function deactivateAdminGlobalBuff(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const buff = await GlobalBuff.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!buff) throw erro("Buff Global não encontrado.", 404);

    const antes = buff.toJSON();
    await buff.update({ ativo: false }, { transaction });

    await registrarAcao({
      idAdmin,
      acao: "desativar",
      entidade: "GlobalBuff",
      idEntidade: buff.id,
      dadosAntes: antes,
      dadosDepois: buff.toJSON(),
      req,
      transaction,
    });

    return buff;
  });
}

module.exports = {
  TIPOS_VALIDOS,
  listAdminGlobalBuffs,
  createAdminGlobalBuff,
  updateAdminGlobalBuff,
  deactivateAdminGlobalBuff,
};
