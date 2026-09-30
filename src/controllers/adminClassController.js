// Painel Administrativo — Classes V2 Fase 2. Controller fino, delega pro
// adminClassService (mesmo padrão de adminAlchemyController.js).
const adminClassService = require("../services/adminClassService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listarClasses = async (req, res) => {
  try {
    const classes = await adminClassService.listarClasses();
    res.status(200).json({ status: "success", data: { classes } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar classes.");
  }
};

exports.buscarClasse = async (req, res) => {
  try {
    const dados = await adminClassService.buscarClasseComArvore(req.params.id);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar classe.");
  }
};

exports.atualizarClasse = async (req, res) => {
  try {
    const classe = await adminClassService.atualizarClasse(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { classe } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar classe.");
  }
};

exports.criarCaminho = async (req, res) => {
  try {
    const caminho = await adminClassService.criarCaminho(req.params.idClasse, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { caminho } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar caminho de evolução.");
  }
};

exports.atualizarCaminho = async (req, res) => {
  try {
    const caminho = await adminClassService.atualizarCaminho(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { caminho } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar caminho de evolução.");
  }
};

exports.excluirCaminho = async (req, res) => {
  try {
    const force = req.query.force === "true" || req.body?.force === true;
    const resultado = await adminClassService.excluirCaminho(req.params.id, { idAdmin: req.user.id, req, force });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir caminho de evolução.");
  }
};

exports.criarRequisito = async (req, res) => {
  try {
    const requisito = await adminClassService.criarRequisito(req.params.idEvolucao, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { requisito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar requisito.");
  }
};

exports.atualizarRequisito = async (req, res) => {
  try {
    const requisito = await adminClassService.atualizarRequisito(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { requisito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar requisito.");
  }
};

exports.excluirRequisito = async (req, res) => {
  try {
    const resultado = await adminClassService.excluirRequisito(req.params.id, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir requisito.");
  }
};

exports.criarHabilidade = async (req, res) => {
  try {
    const habilidade = await adminClassService.criarHabilidade(req.params.idEvolucao, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { habilidade } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar habilidade concedida.");
  }
};

exports.atualizarHabilidade = async (req, res) => {
  try {
    const habilidade = await adminClassService.atualizarHabilidade(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { habilidade } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar habilidade concedida.");
  }
};

exports.excluirHabilidade = async (req, res) => {
  try {
    const resultado = await adminClassService.excluirHabilidade(req.params.id, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir habilidade concedida.");
  }
};

exports.catalogoEfeitos = async (req, res) => {
  try {
    res.status(200).json({ status: "success", data: { efeitos: adminClassService.catalogoEfeitos() } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar catálogo de efeitos.");
  }
};

exports.criarEfeito = async (req, res) => {
  try {
    const efeito = await adminClassService.criarEfeito(req.params.idEvolucao, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar efeito.");
  }
};

exports.atualizarEfeito = async (req, res) => {
  try {
    const efeito = await adminClassService.atualizarEfeito(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar efeito.");
  }
};

exports.excluirEfeito = async (req, res) => {
  try {
    const resultado = await adminClassService.excluirEfeito(req.params.id, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir efeito.");
  }
};

exports.validarIntegridade = async (req, res) => {
  try {
    const resultado = await adminClassService.validarIntegridade();
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao validar integridade das classes.");
  }
};

exports.simularEvolucao = async (req, res) => {
  try {
    const resultado = await adminClassService.simularEvolucao(req.body ?? {});
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular evolução.");
  }
};
