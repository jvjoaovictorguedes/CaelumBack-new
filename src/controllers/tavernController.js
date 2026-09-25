// Sistema de Taverna — controller fino, delega tudo pros services do
// domínio (tavernRestService agora; tavernBuffService/tavernGameService
// entram nas próximas fases).
const tavernRestService = require("../services/tavernRestService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.previewDescanso = async (req, res) => {
  try {
    const preview = await tavernRestService.previewDescanso(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: preview });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao calcular o preview de descanso.");
  }
};

exports.confirmarDescanso = async (req, res) => {
  try {
    const resultado = await tavernRestService.confirmarDescanso(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao confirmar o descanso.");
  }
};
