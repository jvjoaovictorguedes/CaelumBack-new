const adminPlayerShopService = require("../services/adminPlayerShopService");
const adminPlayerShopConfigService = require("../services/adminPlayerShopConfigService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.obterConfig = async (req, res) => {
  try {
    const config = await adminPlayerShopConfigService.getAdminPlayerShopConfig();
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar configuração.");
  }
};

exports.atualizarConfig = async (req, res) => {
  try {
    const config = await adminPlayerShopConfigService.updateAdminPlayerShopConfig(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar configuração.");
  }
};

exports.listarLojas = async (req, res) => {
  try {
    const { pagina, porPagina, ativa } = req.query;
    const resultado = await adminPlayerShopService.listarLojasAdmin({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      ativa: ativa !== undefined ? ativa === "true" : undefined,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar lojas.");
  }
};

exports.desativarLoja = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const loja = await adminPlayerShopService.desativarLojaAdmin(Number(req.params.idPersonagem), {
      idAdmin: req.user.id,
      motivo,
      req,
    });
    res.status(200).json({ status: "success", data: { loja } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar loja.");
  }
};

exports.listarDemandas = async (req, res) => {
  try {
    const { pagina, porPagina, status } = req.query;
    const resultado = await adminPlayerShopService.listarDemandasAdmin({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      status,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar demandas.");
  }
};

exports.cancelarDemanda = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const demanda = await adminPlayerShopService.cancelarDemandaAdmin(Number(req.params.idDemanda), {
      idAdmin: req.user.id,
      motivo,
      req,
    });
    res.status(200).json({ status: "success", data: { demanda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar demanda.");
  }
};

exports.listarEncomendas = async (req, res) => {
  try {
    const { pagina, porPagina, status } = req.query;
    const resultado = await adminPlayerShopService.listarEncomendasAdmin({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      status,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar encomendas.");
  }
};

exports.cancelarEncomenda = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const encomenda = await adminPlayerShopService.cancelarEncomendaAdmin(Number(req.params.idEncomenda), {
      idAdmin: req.user.id,
      motivo,
      req,
    });
    res.status(200).json({ status: "success", data: { encomenda } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar encomenda.");
  }
};
