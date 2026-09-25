// Painel Administrativo Fase 12 — controller fino de Premiações.
const adminGrantService = require("../services/adminGrantService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.buscar = async (req, res) => {
  try {
    const personagens = await adminGrantService.searchCharacters(req.query.termo);
    res.status(200).json({ status: "success", data: { personagens } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar jogador.");
  }
};

exports.conceder = async (req, res) => {
  try {
    const resultado = await adminGrantService.grantToCharacter(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao conceder a premiação.");
  }
};
