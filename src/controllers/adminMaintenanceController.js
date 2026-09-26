// Modo Manutenção — controller fino, delega pro adminMaintenanceService.
const adminMaintenanceService = require("../services/adminMaintenanceService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// GET /api/admin/maintenance — status pro painel admin (autenticado).
exports.obterStatus = async (req, res) => {
  try {
    res.status(200).json({ status: "success", data: adminMaintenanceService.getMaintenanceStatus() });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao consultar o Modo Manutenção.");
  }
};

// PATCH /api/admin/maintenance — liga/desliga (e opcionalmente muda a mensagem).
exports.atualizarStatus = async (req, res) => {
  try {
    const resultado = await adminMaintenanceService.setMaintenanceStatus(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar o Modo Manutenção.");
  }
};

// GET /api/maintenance/status — endpoint PÚBLICO (sem auth), pro
// frontend saber se deve mostrar a tela de manutenção ANTES mesmo de
// tentar logar/carregar qualquer coisa.
exports.obterStatusPublico = async (req, res) => {
  try {
    res.status(200).json(adminMaintenanceService.getMaintenanceStatus());
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao consultar o Modo Manutenção.");
  }
};
