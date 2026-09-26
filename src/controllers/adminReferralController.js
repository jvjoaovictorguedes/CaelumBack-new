// Painel Administrativo — Referral. Controller fino; toda a lógica mora
// em adminReferralService.js.
const adminReferralService = require("../services/adminReferralService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listarIndicados = async (req, res) => {
  try {
    const { pagina, porPagina, busca } = req.query;
    const resultado = await adminReferralService.listarIndicados({ pagina, porPagina, busca });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar indicações.");
  }
};

exports.obterResumo = async (req, res) => {
  try {
    const resumo = await adminReferralService.obterResumo();
    res.status(200).json({ status: "success", data: resumo });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao consultar o resumo de indicações.");
  }
};
