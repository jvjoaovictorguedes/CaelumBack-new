// Sistema de Taverna — controller fino, delega tudo pros services do
// domínio (tavernRestService/tavernBuffService agora; tavernGameService
// entra na próxima fase).
const tavernRestService = require("../services/tavernRestService");
const tavernBuffService = require("../services/tavernBuffService");

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

exports.listarCardapio = async (req, res) => {
  try {
    const itens = await tavernBuffService.listarCardapioAtivo();
    res.status(200).json({ status: "success", data: { itens } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar o cardápio.");
  }
};

exports.consumirOferta = async (req, res) => {
  try {
    const resultado = await tavernBuffService.consumirOferta(req.personagemAtual.id, Number(req.params.id));
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao comprar a oferta.");
  }
};

exports.listarBuffsAtivos = async (req, res) => {
  try {
    const buffs = await tavernBuffService.buffsAtivosDoPersonagem(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { buffs } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar os buffs ativos.");
  }
};
