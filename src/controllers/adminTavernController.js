// Painel Administrativo — Sistema de Taverna — controller fino, delega
// tudo pro adminTavernService.
const adminTavernService = require("../services/adminTavernService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listarMenu = async (req, res) => {
  try {
    const { pagina, porPagina, categoria, ativo, nome } = req.query;
    const resultado = await adminTavernService.listAdminTavernMenu({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      categoria,
      ativo,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar o cardápio.");
  }
};

exports.criarItemMenu = async (req, res) => {
  try {
    const item = await adminTavernService.createAdminTavernMenuItem(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar oferta.");
  }
};

exports.atualizarItemMenu = async (req, res) => {
  try {
    const item = await adminTavernService.updateAdminTavernMenuItem(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar oferta.");
  }
};

exports.duplicarItemMenu = async (req, res) => {
  try {
    const item = await adminTavernService.duplicateAdminTavernMenuItem(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar oferta.");
  }
};

exports.desativarItemMenu = async (req, res) => {
  try {
    const item = await adminTavernService.setAtivoAdminTavernMenuItem(req.params.id, false, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar oferta.");
  }
};

exports.reativarItemMenu = async (req, res) => {
  try {
    const item = await adminTavernService.setAtivoAdminTavernMenuItem(req.params.id, true, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { item } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar oferta.");
  }
};

exports.listarJogos = async (req, res) => {
  try {
    const { pagina, porPagina, ativo } = req.query;
    const resultado = await adminTavernService.listAdminTavernGames({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      ativo,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar os jogos.");
  }
};

exports.criarJogo = async (req, res) => {
  try {
    const jogo = await adminTavernService.createAdminTavernGame(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { jogo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar jogo.");
  }
};

exports.atualizarJogo = async (req, res) => {
  try {
    const jogo = await adminTavernService.updateAdminTavernGame(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { jogo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar jogo.");
  }
};

exports.duplicarJogo = async (req, res) => {
  try {
    const jogo = await adminTavernService.duplicateAdminTavernGame(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { jogo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar jogo.");
  }
};

exports.desativarJogo = async (req, res) => {
  try {
    const jogo = await adminTavernService.setAtivoAdminTavernGame(req.params.id, false, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { jogo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao desativar jogo.");
  }
};

exports.reativarJogo = async (req, res) => {
  try {
    const jogo = await adminTavernService.setAtivoAdminTavernGame(req.params.id, true, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { jogo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao reativar jogo.");
  }
};

exports.obterConfiguracoes = async (req, res) => {
  try {
    const configuracoes = await adminTavernService.getAdminTavernSettings();
    res.status(200).json({ status: "success", data: { configuracoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar as configurações.");
  }
};

exports.atualizarConfiguracoes = async (req, res) => {
  try {
    const configuracoes = await adminTavernService.updateAdminTavernSettings(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { configuracoes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar as configurações.");
  }
};

exports.obterMetricas = async (req, res) => {
  try {
    const metricas = await adminTavernService.getAdminTavernMetrics();
    res.status(200).json({ status: "success", data: metricas });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar as métricas.");
  }
};
