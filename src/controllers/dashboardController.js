// Dashboard V2 — "Centro do Aventureiro". Controller fino: toda a lógica
// de agregação vive em dashboardSummaryService (mesmo padrão do resto do
// projeto — controller nunca recalcula nada, só delega e trata erro).
const dashboardSummaryService = require("../services/dashboardSummaryService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// GET /api/dashboard/summary
exports.obterResumo = async (req, res) => {
  try {
    const resumo = await dashboardSummaryService.buildForCharacter(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: resumo });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao montar o resumo do Dashboard.");
  }
};
