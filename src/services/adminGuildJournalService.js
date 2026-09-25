// Jornal da Guilda dos Aventureiros — CRUD admin, mesmo workflow
// Rascunho/Publicado/Agendado dos Patch Notes (ver adminPatchNoteService.js).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const GuildJournalEntry = require("../models/GuildJournalEntry");
const { registrarAcao } = require("./adminAuditService");

const STATUS_VALIDOS = ["Rascunho", "Publicado", "Agendado"];
const CATEGORIAS_VALIDAS = ["ConquistaIndividual", "ConquistaDeGuilda", "Evento", "Outro"];

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

function validar(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.titulo !== undefined) {
    if (!dados.titulo || typeof dados.titulo !== "string") erros.push("titulo é obrigatório.");
  }
  if (!parcial || dados.descricao !== undefined) {
    if (!dados.descricao || typeof dados.descricao !== "string") erros.push("descricao é obrigatória.");
  }
  if (dados.categoria !== undefined && !CATEGORIAS_VALIDAS.includes(dados.categoria)) {
    erros.push(`categoria precisa ser uma de: ${CATEGORIAS_VALIDAS.join(", ")}.`);
  }
  if (dados.status !== undefined && !STATUS_VALIDOS.includes(dados.status)) {
    erros.push(`status precisa ser um de: ${STATUS_VALIDOS.join(", ")}.`);
  }
  if (dados.publicado_em !== undefined && dados.publicado_em !== null) {
    if (Number.isNaN(Date.parse(dados.publicado_em))) erros.push("publicado_em precisa ser uma data válida.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

// resumo/imagem_url/personagem_nome/guilda_nome são opcionais — string
// vazia do formulário admin vira null aqui, não "" (senão "resumo ||
// descricao" do lado do jogador nunca cairia no fallback certo).
const CAMPOS_TEXTO_OPCIONAIS = ["resumo", "imagem_url", "personagem_nome", "guilda_nome"];

function campos(dados) {
  const permitidos = [
    "categoria",
    "titulo",
    "descricao",
    "resumo",
    "imagem_url",
    "personagem_nome",
    "guilda_nome",
    "destaque",
    "status",
    "publicado_em",
  ];
  const out = {};
  for (const campo of permitidos) {
    if (dados[campo] === undefined) continue;
    out[campo] =
      CAMPOS_TEXTO_OPCIONAIS.includes(campo) && dados[campo] === "" ? null : dados[campo];
  }
  return out;
}

async function listAdminGuildJournalEntries({ pagina = 1, porPagina = 20, status, categoria, nome } = {}) {
  const where = {};
  if (status) where.status = status;
  if (categoria) where.categoria = categoria;
  if (nome) where.titulo = { [Op.iLike]: `%${nome}%` };

  const limite = Math.min(100, Math.max(1, Number(porPagina) || 20));
  const paginaAtual = Math.max(1, Number(pagina) || 1);
  const offset = (paginaAtual - 1) * limite;

  const { count, rows } = await GuildJournalEntry.findAndCountAll({
    where,
    order: [["ordem", "DESC"]],
    limit: limite,
    offset,
  });

  return { total: count, pagina: paginaAtual, porPagina: limite, itens: rows };
}

async function createAdminGuildJournalEntry(dados, { idAdmin, req }) {
  validar(dados);

  return sequelize.transaction(async (transaction) => {
    const [[{ max }]] = await sequelize.query(`SELECT COALESCE(MAX(ordem), 0) AS max FROM guild_journal_entries;`, {
      transaction,
    });

    const nota = await GuildJournalEntry.create(
      {
        ...campos(dados),
        ordem: max + 1,
        categoria: dados.categoria ?? "Outro",
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
      entidade: "GuildJournalEntry",
      idEntidade: nota.id,
      dadosDepois: nota.toJSON(),
      req,
      transaction,
    });

    return nota;
  });
}

async function updateAdminGuildJournalEntry(id, dados, { idAdmin, req }) {
  validar(dados, { parcial: true });

  return sequelize.transaction(async (transaction) => {
    const nota = await GuildJournalEntry.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!nota) throw erro("Nota do Jornal não encontrada.", 404);

    const antes = nota.toJSON();
    await nota.update(campos(dados), { transaction });

    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "GuildJournalEntry",
      idEntidade: nota.id,
      dadosAntes: antes,
      dadosDepois: nota.toJSON(),
      req,
      transaction,
    });

    return nota;
  });
}

module.exports = {
  STATUS_VALIDOS,
  CATEGORIAS_VALIDAS,
  listAdminGuildJournalEntries,
  createAdminGuildJournalEntry,
  updateAdminGuildJournalEntry,
};
