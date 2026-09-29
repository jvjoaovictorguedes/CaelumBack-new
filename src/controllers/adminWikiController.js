// Painel Administrativo — Wiki do Jogo. Controller fino, delega tudo
// pro adminWikiService (mesmo padrão de adminPatchNoteController).
const adminWikiService = require("../services/adminWikiService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { categoria, publicado, nome } = req.query;
    const artigos = await adminWikiService.listAdminWikiArticles({ categoria, publicado, nome });
    res.status(200).json({ status: "success", data: { artigos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar artigos da Wiki.");
  }
};

exports.listarCategorias = async (req, res) => {
  try {
    const categorias = await adminWikiService.listAdminWikiCategorias();
    res.status(200).json({ status: "success", data: { categorias } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar categorias da Wiki.");
  }
};

exports.criar = async (req, res) => {
  try {
    const artigo = await adminWikiService.createAdminWikiArticle(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { artigo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar artigo da Wiki.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const artigo = await adminWikiService.updateAdminWikiArticle(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { artigo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar artigo da Wiki.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const artigo = await adminWikiService.duplicateAdminWikiArticle(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { artigo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar artigo da Wiki.");
  }
};

exports.excluir = async (req, res) => {
  try {
    await adminWikiService.deleteAdminWikiArticle(req.params.id, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir artigo da Wiki.");
  }
};
