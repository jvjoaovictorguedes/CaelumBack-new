// src/controllers/alchemyController.js
//
// Caldeirão (Alquimia) — fino de propósito, igual forgeController.js:
// toda a lógica mora em alchemyService.js, aqui só valida entrada HTTP e
// formata resposta. Personagem sempre vem de req.personagemAtual (spec
// §28: "Validar personagem atual pela sessão, não por id_personagem
// arbitrário do payload").
const alchemyService = require("../services/alchemyService");
const alchemyRecipeUnlockService = require("../services/alchemyRecipeUnlockService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// GET /api/alchemy/progress
exports.getProgresso = async (req, res) => {
  try {
    const progresso = await alchemyService.obterProgresso(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { progresso } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar progresso de Alquimia.");
  }
};

// GET /api/alchemy/recipes
exports.getReceitas = async (req, res) => {
  try {
    const receitas = await alchemyService.listarReceitas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { receitas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar receitas de Alquimia.");
  }
};

// GET /api/alchemy/recipes/:id
exports.getReceita = async (req, res) => {
  try {
    const receita = await alchemyService.detalharReceita(req.personagemAtual.id, Number(req.params.id));
    res.status(200).json({ status: "success", data: { receita } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar receita de Alquimia.");
  }
};

// POST /api/alchemy/recipes/:id/brew — body: { quantity, idempotencyKey }
exports.postBrew = async (req, res) => {
  try {
    const { quantity, idempotencyKey } = req.body;
    const resultado = await alchemyService.prepararLote(req.personagemAtual.id, Number(req.params.id), {
      quantity,
      idempotencyKey,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao preparar receita de Alquimia.");
  }
};

// GET /api/alchemy/discoveries
exports.getDescobertas = async (req, res) => {
  try {
    const descobertas = await alchemyRecipeUnlockService.listarDescobertas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { descobertas } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar descobertas de Alquimia.");
  }
};
