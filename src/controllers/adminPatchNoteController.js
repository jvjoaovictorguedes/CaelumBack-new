// Painel Administrativo Fase 13 (§24) — controller fino, delega tudo
// pro adminPatchNoteService.
const adminPatchNoteService = require("../services/adminPatchNoteService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, status, feature, nome } = req.query;
    const resultado = await adminPatchNoteService.listAdminPatchNotes({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      status,
      feature,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar patch notes.");
  }
};

exports.criar = async (req, res) => {
  try {
    const nota = await adminPatchNoteService.createAdminPatchNote(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { nota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar patch note.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const nota = await adminPatchNoteService.updateAdminPatchNote(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { nota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar patch note.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const nota = await adminPatchNoteService.duplicateAdminPatchNote(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { nota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar patch note.");
  }
};
