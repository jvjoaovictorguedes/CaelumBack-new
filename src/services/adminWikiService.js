// Painel Administrativo — Wiki do Jogo. Mesmo padrão de
// adminPatchNoteService.js: publicar/editar artigos sem precisar de
// deploy — o jogo inteiro (Aventura, Expedição, Forja, Guildas, etc.)
// vira conteúdo gerido aqui, não markdown solto no repositório.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const WikiArticle = require("../models/WikiArticle");
const { registrarAcao } = require("./adminAuditService");

function erro(mensagem, statusCode = 400) {
  const e = new Error(mensagem);
  e.statusCode = statusCode;
  return e;
}

// Mesma normalização de slug em toda parte que aceita um — nunca gerar
// slug direto do título sem passar por aqui, senão dois artigos com
// título parecido ("Guilda: Boss" / "Guilda - Boss") colidem ou geram
// URLs com espaço/maiúscula.
function normalizarSlug(valor) {
  return String(valor ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validar(dados, { parcial = false } = {}) {
  const erros = [];
  if (!parcial || dados.categoria !== undefined) {
    if (!dados.categoria || typeof dados.categoria !== "string") erros.push("categoria é obrigatória.");
  }
  if (!parcial || dados.titulo !== undefined) {
    if (!dados.titulo || typeof dados.titulo !== "string") erros.push("titulo é obrigatório.");
  }
  if (!parcial || dados.conteudo !== undefined) {
    if (!dados.conteudo || typeof dados.conteudo !== "string") erros.push("conteudo é obrigatório.");
  }
  if (dados.slug !== undefined && dados.slug !== null && normalizarSlug(dados.slug) === "") {
    erros.push("slug precisa ter pelo menos uma letra ou número.");
  }
  if (erros.length > 0) throw erro(erros.join(" "));
}

function campos(dados) {
  const permitidos = ["categoria", "titulo", "resumo", "conteudo", "ordem", "imagem_url", "publicado"];
  const out = {};
  for (const campo of permitidos) {
    if (dados[campo] !== undefined) out[campo] = dados[campo];
  }
  return out;
}

async function listAdminWikiArticles({ categoria, publicado, nome } = {}) {
  const where = {};
  if (categoria) where.categoria = categoria;
  if (publicado !== undefined) where.publicado = publicado === "true" || publicado === true;
  if (nome) where.titulo = { [Op.iLike]: `%${nome}%` };

  return WikiArticle.findAll({ where, order: [["categoria", "ASC"], ["ordem", "ASC"], ["id", "ASC"]] });
}

async function listAdminWikiCategorias() {
  const linhas = await WikiArticle.findAll({
    attributes: [[sequelize.fn("DISTINCT", sequelize.col("categoria")), "categoria"]],
    order: [["categoria", "ASC"]],
    raw: true,
  });
  return linhas.map((l) => l.categoria);
}

async function createAdminWikiArticle(dados, { idAdmin, req }) {
  validar(dados);
  const slugDesejado = normalizarSlug(dados.slug || dados.titulo);

  return sequelize.transaction(async (transaction) => {
    const conflito = await WikiArticle.findOne({ where: { slug: slugDesejado }, transaction });
    if (conflito) throw erro(`Já existe um artigo com o slug "${slugDesejado}".`);

    const [[{ max }]] = await sequelize.query(
      `SELECT COALESCE(MAX(ordem), -1) AS max FROM wiki_articles WHERE categoria = :categoria;`,
      { replacements: { categoria: dados.categoria }, transaction },
    );

    const artigo = await WikiArticle.create(
      {
        ...campos(dados),
        slug: slugDesejado,
        ordem: dados.ordem ?? max + 1,
        publicado: dados.publicado ?? true,
        created_by_admin_id: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "criar",
      entidade: "WikiArticle",
      idEntidade: artigo.id,
      dadosDepois: artigo.toJSON(),
      req,
      transaction,
    });

    return artigo;
  });
}

async function updateAdminWikiArticle(id, dados, { idAdmin, req }) {
  validar(dados, { parcial: true });

  return sequelize.transaction(async (transaction) => {
    const artigo = await WikiArticle.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!artigo) throw erro("Artigo da Wiki não encontrado.", 404);

    const dadosFinais = campos(dados);
    if (dados.slug !== undefined) {
      const slugNovo = normalizarSlug(dados.slug);
      if (slugNovo !== artigo.slug) {
        const conflito = await WikiArticle.findOne({ where: { slug: slugNovo }, transaction });
        if (conflito) throw erro(`Já existe um artigo com o slug "${slugNovo}".`);
      }
      dadosFinais.slug = slugNovo;
    }

    const antes = artigo.toJSON();
    await artigo.update(dadosFinais, { transaction });

    await registrarAcao({
      idAdmin,
      acao: "editar",
      entidade: "WikiArticle",
      idEntidade: artigo.id,
      dadosAntes: antes,
      dadosDepois: artigo.toJSON(),
      req,
      transaction,
    });

    return artigo;
  });
}

async function duplicateAdminWikiArticle(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const original = await WikiArticle.findByPk(id, { transaction });
    if (!original) throw erro("Artigo da Wiki não encontrado.", 404);

    let slugCopia = `${original.slug}-copia`;
    let sufixo = 2;
    while (await WikiArticle.findOne({ where: { slug: slugCopia }, transaction })) {
      slugCopia = `${original.slug}-copia-${sufixo}`;
      sufixo += 1;
    }

    const copia = await WikiArticle.create(
      {
        categoria: original.categoria,
        slug: slugCopia,
        titulo: `${original.titulo} (cópia)`,
        resumo: original.resumo,
        conteudo: original.conteudo,
        ordem: original.ordem,
        imagem_url: original.imagem_url,
        publicado: false,
        created_by_admin_id: idAdmin,
      },
      { transaction },
    );

    await registrarAcao({
      idAdmin,
      acao: "duplicar",
      entidade: "WikiArticle",
      idEntidade: copia.id,
      dadosAntes: { origemId: original.id },
      dadosDepois: copia.toJSON(),
      req,
      transaction,
    });

    return copia;
  });
}

async function deleteAdminWikiArticle(id, { idAdmin, req }) {
  return sequelize.transaction(async (transaction) => {
    const artigo = await WikiArticle.findByPk(id, { transaction });
    if (!artigo) throw erro("Artigo da Wiki não encontrado.", 404);

    const antes = artigo.toJSON();
    await artigo.destroy({ transaction });

    await registrarAcao({
      idAdmin,
      acao: "excluir",
      entidade: "WikiArticle",
      idEntidade: id,
      dadosAntes: antes,
      req,
      transaction,
    });
  });
}

module.exports = {
  normalizarSlug,
  listAdminWikiArticles,
  listAdminWikiCategorias,
  createAdminWikiArticle,
  updateAdminWikiArticle,
  duplicateAdminWikiArticle,
  deleteAdminWikiArticle,
};
