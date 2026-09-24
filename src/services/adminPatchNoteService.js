// Painel Administrativo Fase 13 (§24) — publicar atualizações sem
// precisar de migration nova a cada vez. Workflow Rascunho/Publicado/
// Agendado (ver patchNotesController — Agendado só aparece pro jogador
// quando publicado_em chega, sem cron).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const PatchNote = require("../models/PatchNote");
const { registrarAcao } = require("./adminAuditService");

const STATUS_VALIDOS = ["Rascunho", "Publicado", "Agendado"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function validar(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.feature !== undefined) {
    if (!dados.feature || typeof dados.feature !== "string") erros.push("feature é obrigatória.");
  }
  if (!parcial || dados.versao !== undefined) {
    if (!dados.versao || typeof dados.versao !== "string") erros.push("versao é obrigatória.");
  }
  if (!parcial || dados.titulo !== undefined) {
    if (!dados.titulo || typeof dados.titulo !== "string") erros.push("titulo é obrigatório.");
  }
  if (!parcial || dados.descricao !== undefined) {
    if (!dados.descricao || typeof dados.descricao !== "string") erros.push("descricao é obrigatória.");
  }
  if (dados.status !== undefined && !STATUS_VALIDOS.includes(dados.status)) {
    erros.push(`status precisa ser um de: ${STATUS_VALIDOS.join(", ")}.`);
  }
  if (dados.publicado_em !== undefined && dados.publicado_em !== null) {
    if (Number.isNaN(Date.parse(dados.publicado_em))) erros.push("publicado_em precisa ser uma data válida.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function campos(dados) {
  const permitidos = ["feature", "versao", "titulo", "descricao", "resumo", "imagem_url", "destaque", "status", "publicado_em"];
  const out = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  return out;
}

async function listAdminPatchNotes({ pagina = 1, porPagina = 20, status, feature, nome } = {}) {
  const where = {};
  if (status) where.status = status;
  if (feature) where.feature = feature;
  if (nome) where.titulo = { [Op.iLike]: `%${nome}%` };

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await PatchNote.findAndCountAll({
    where,
    order: [["ordem", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function createAdminPatchNote(dados, { idAdmin, req }) {
  validar(dados);

  return sequelize.transaction(async (transaction) => {
    const [[{ max }]] = await sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`, {
      transaction,
    });

    const nota = await PatchNote.create(
      {
        ...campos(dados),
        ordem: max + 1,
        status: dados.status ?? "Rascunho",
        publicado_em: dados.publicado_em ?? new Date().toISOString().slice(0, 10),
        destaque: dados.destaque ?? false,
        created_by_admin_id: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "PatchNote",
      idEntidade: nota.id,
      dadosDepois: nota.toJSON(),
      req,
      transaction,
    });

    return nota;
  });
}

async function updateAdminPatchNote(id, dados, { idAdmin, req }) {
  validar(dados, { parcial: true });

  return sequelize.transaction(async (transaction) => {
    const nota = await PatchNote.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!nota) throw erro("Patch note não encontrada.", 404);

    const antes = nota.toJSON();
    await nota.update(campos(dados), { transaction });

    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "PatchNote",
      idEntidade: nota.id,
      dadosAntes: antes,
      dadosDepois: nota.toJSON(),
      req,
      transaction,
    });

    return nota;
  });
}

async function duplicateAdminPatchNote(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await PatchNote.findByPk(id, { transaction });
    if (!original) throw erro("Patch note não encontrada.", 404);

    const [[{ max }]] = await sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM patch_notes;`, {
      transaction,
    });

    const copia = await PatchNote.create(
      {
        feature: original.feature,
        versao: `${original.versao} (cópia)`,
        titulo: original.titulo,
        descricao: original.descricao,
        resumo: original.resumo,
        imagem_url: original.imagem_url,
        destaque: false,
        status: "Rascunho",
        publicado_em: new Date().toISOString().slice(0, 10),
        ordem: max + 1,
        created_by_admin_id: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "PatchNote",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id },
      dadosDepois: copia.toJSON(),
      req,
      transaction,
    });

    return copia;
  });
}

module.exports = {
  STATUS_VALIDOS,
  listAdminPatchNotes,
  createAdminPatchNote,
  updateAdminPatchNote,
  duplicateAdminPatchNote,
};
