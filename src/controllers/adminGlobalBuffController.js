// Painel Administrativo Fase 15 — controller fino, delega tudo pro
// adminGlobalBuffService.
const adminGlobalBuffService = require("../services/adminGlobalBuffService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, tipo, ativo, nome } = req.query;
    const resultado = await adminGlobalBuffService.listAdminGlobalBuffs({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      tipo,
      ativo,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar buffs globais.");
  }
};

exports.criar = async (req, res) => {
  try {
    const buff = await adminGlobalBuffService.createAdminGlobalBuff(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { buff } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar buff global.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const buff = await adminGlobalBuffService.updateAdminGlobalBuff(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { buff } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar buff global.");
  }
};

exports.desativar = async (req, res) => {
  try {
    const buff = await adminGlobalBuffService.deactivateAdminGlobalBuff(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { buff } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar buff global.");
  }
};
