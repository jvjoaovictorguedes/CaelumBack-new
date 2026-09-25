// Painel Administrativo Fase 14 (§25) — controller fino.
const adminGameSettingService = require("../services/adminGameSettingService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const settings = await adminGameSettingService.listAdminGameSettings();
    res.status(200).json({ status: "success", data: { settings } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar configurações.");
  }
};

exports.salvar = async (req, res) => {
  try {
    const { chave } = req.params;
    const setting = await adminGameSettingService.upsertAdminGameSetting(chave, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { setting } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar configuração.");
  }
};
