// Painel Administrativo — Boss Global (catálogo) — controller fino,
// delega tudo pro adminWorldBossService.
const adminWorldBossService = require("../services/adminWorldBossService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, ativo, nome } = req.query;
    const resultado = await adminWorldBossService.listAdminWorldBossConfigs({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      ativo,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar catálogo de Ameaças Mundiais.");
  }
};

exports.obter = async (req, res) => {
  try {
    const config = await adminWorldBossService.getAdminWorldBossConfig(req.params.id);
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter a Ameaça Mundial.");
  }
};

exports.criar = async (req, res) => {
  try {
    const config = await adminWorldBossService.createAdminWorldBossConfig(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar Ameaça Mundial.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const config = await adminWorldBossService.updateAdminWorldBossConfig(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar Ameaça Mundial.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const config = await adminWorldBossService.duplicateAdminWorldBossConfig(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar Ameaça Mundial.");
  }
};

exports.desativar = async (req, res) => {
  try {
    const config = await adminWorldBossService.setAtivoAdminWorldBossConfig(req.params.id, false, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar Ameaça Mundial.");
  }
};

exports.reativar = async (req, res) => {
  try {
    const config = await adminWorldBossService.setAtivoAdminWorldBossConfig(req.params.id, true, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar Ameaça Mundial.");
  }
};

exports.obterConfiguracoes = async (req, res) => {
  try {
    const settings = await adminWorldBossService.getAdminWorldBossSettings();
    res.status(200).json({ status: "success", data: { settings } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter configurações.");
  }
};

exports.atualizarConfiguracoes = async (req, res) => {
  try {
    const settings = await adminWorldBossService.updateAdminWorldBossSettings(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { settings } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar configurações.");
  }
};

exports.metricas = async (req, res) => {
  try {
    const metricas = await adminWorldBossService.getAdminWorldBossMetrics();
    res.status(200).json({ status: "success", data: metricas });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter métricas.");
  }
};
