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
