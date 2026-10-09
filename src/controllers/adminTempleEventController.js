// Painel Administrativo — Templo do Véu Celestial (editor de
// Convergência) — controller fino, delega tudo pro
// adminTempleEventService.
const adminTempleEventService = require("../services/adminTempleEventService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, status, nome } = req.query;
    const resultado = await adminTempleEventService.listarEventos({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      status,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar Convergências.");
  }
};

exports.obter = async (req, res) => {
  try {
    const dados = await adminTempleEventService.obterEvento(req.params.id);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter a Convergência.");
  }
};

exports.criar = async (req, res) => {
  try {
    const evento = await adminTempleEventService.criarEvento(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar a Convergência.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const evento = await adminTempleEventService.atualizarEvento(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar a Convergência.");
  }
};

exports.agendar = async (req, res) => {
  try {
    const evento = await adminTempleEventService.agendarEvento(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao agendar a Convergência.");
  }
};

exports.cancelar = async (req, res) => {
  try {
    const evento = await adminTempleEventService.cancelarEvento(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar a Convergência.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const dados = await adminTempleEventService.duplicarEvento(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar a Convergência.");
  }
};
