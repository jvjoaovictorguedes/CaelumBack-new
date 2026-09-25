// Painel Administrativo Fase 10 — controller fino da configuração do
// Balcão de Espólios.
const adminSpoilConfigService = require("../services/adminSpoilConfigService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.obter = async (req, res) => {
  try {
    const config = await adminSpoilConfigService.getAdminSpoilConfig();
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar a configuração.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const config = await adminSpoilConfigService.updateAdminSpoilConfig(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar a configuração.");
  }
};
