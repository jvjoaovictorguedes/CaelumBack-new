// Painel Administrativo — Templo do Véu Celestial (Relicário dos
// Ecos de um evento) — controller fino, delega tudo pro
// adminTempleRelicaryService.
const adminTempleRelicaryService = require("../services/adminTempleRelicaryService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.obter = async (req, res) => {
  try {
    const dados = await adminTempleRelicaryService.obterRelicarioAdmin(req.params.idEvento);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter o Relicário.");
  }
};

exports.salvarPool = async (req, res) => {
  try {
    const pool = await adminTempleRelicaryService.salvarPool(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { pool } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar o pool do Relicário.");
  }
};

exports.criarEntry = async (req, res) => {
  try {
    const entry = await adminTempleRelicaryService.criarEntry(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { entry } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar a entry do Relicário.");
  }
};

exports.atualizarEntry = async (req, res) => {
  try {
    const entry = await adminTempleRelicaryService.atualizarEntry(req.params.idEvento, req.params.idEntry, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { entry } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar a entry do Relicário.");
  }
};

exports.excluirEntry = async (req, res) => {
  try {
    await adminTempleRelicaryService.excluirEntry(req.params.idEvento, req.params.idEntry, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir a entry do Relicário.");
  }
};

exports.previewOdds = async (req, res) => {
  try {
    const preview = await adminTempleRelicaryService.previewOdds(req.params.idEvento);
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular o preview de odds.");
  }
};
