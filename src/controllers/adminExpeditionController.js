// Painel Administrativo de Expedição — controller fino, delega pra
// expeditionSettingsService (mesmo padrão de adminForgeController).
const expeditionSettingsService = require("../services/expeditionSettingsService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.obterBalanceamento = async (req, res) => {
  try {
    const resultado = await expeditionSettingsService.getBalanceamentoCompleto();
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar o balanceamento.");
  }
};

exports.atualizarBalanceamento = async (req, res) => {
  try {
    const resultado = await expeditionSettingsService.updateBalanceamento(req.params.group, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar o balanceamento.");
  }
};
