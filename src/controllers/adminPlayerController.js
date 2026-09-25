const adminPlayerService = require("../services/adminPlayerService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.buscar = async (req, res) => {
  try {
    const personagens = await adminPlayerService.searchPlayers(req.query.termo);
    res.status(200).json({ status: "success", data: { personagens } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao buscar jogador.");
  }
};

exports.detalhe = async (req, res) => {
  try {
    const personagem = await adminPlayerService.getPlayerDetail(req.params.id);
    res.status(200).json({ status: "success", data: { personagem } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao consultar jogador.");
  }
};
