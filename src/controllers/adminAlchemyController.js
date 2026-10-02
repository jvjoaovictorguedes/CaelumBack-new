// Painel Administrativo — controller fino, delega pro adminAlchemyService.
const adminAlchemyService = require("../services/adminAlchemyService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listarReceitas = async (req, res) => {
  try {
    const receitas = await adminAlchemyService.listAdminAlchemyRecipes();
    res.status(200).json({ status: "success", data: { receitas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar receitas de Alquimia.");
  }
};

exports.criarReceita = async (req, res) => {
  try {
    const receita = await adminAlchemyService.createAdminAlchemyRecipe(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { receita } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar receita de Alquimia.");
  }
};

exports.atualizarReceita = async (req, res) => {
  try {
    const receita = await adminAlchemyService.updateAdminAlchemyRecipe(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { receita } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar receita de Alquimia.");
  }
};

exports.listarTiposDeEfeito = async (req, res) => {
  try {
    const tipos = adminAlchemyService.listEffectTypes();
    res.status(200).json({ status: "success", data: { tipos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar tipos de efeito.");
  }
};

exports.listarEfeitosDoItem = async (req, res) => {
  try {
    const efeitos = await adminAlchemyService.listAdminConsumableEffects(req.params.idItem);
    res.status(200).json({ status: "success", data: { efeitos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar efeitos do item.");
  }
};

exports.criarEfeito = async (req, res) => {
  try {
    const efeito = await adminAlchemyService.createAdminConsumableEffect(req.params.idItem, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar efeito de consumível.");
  }
};

exports.atualizarEfeito = async (req, res) => {
  try {
    const efeito = await adminAlchemyService.updateAdminConsumableEffect(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar efeito de consumível.");
  }
};

exports.excluirEfeito = async (req, res) => {
  try {
    const resultado = await adminAlchemyService.deleteAdminConsumableEffect(req.params.id, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir efeito de consumível.");
  }
};
