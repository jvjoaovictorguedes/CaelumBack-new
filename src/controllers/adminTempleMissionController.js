// Painel Administrativo — Templo do Véu Celestial (Provações de um
// evento) — controller fino, delega tudo pro
// adminTempleMissionService.
const adminTempleMissionService = require("../services/adminTempleMissionService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const missoes = await adminTempleMissionService.listarMissoes(req.params.idEvento);
    res.status(200).json({ status: "success", data: { missoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar Provações.");
  }
};

exports.criar = async (req, res) => {
  try {
    const missao = await adminTempleMissionService.criarMissao(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar a Provação.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const missao = await adminTempleMissionService.atualizarMissao(req.params.idEvento, req.params.idMissao, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { missao } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar a Provação.");
  }
};

exports.excluir = async (req, res) => {
  try {
    await adminTempleMissionService.excluirMissao(req.params.idEvento, req.params.idMissao, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir a Provação.");
  }
};

exports.preview = async (req, res) => {
  try {
    const preview = adminTempleMissionService.previewMissao(req.body ?? {});
    res.status(200).json({ status: "success", data: { preview } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao gerar o preview da Provação.");
  }
};
