// Painel Administrativo — Boss Global (operação do ciclo atual) —
// controller fino, delega tudo pro adminWorldBossEventService.
const adminWorldBossEventService = require("../services/adminWorldBossEventService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.status = async (req, res) => {
  try {
    const status = await adminWorldBossEventService.getStatusOperacional();
    res.status(200).json({ status: "success", data: status });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter status operacional.");
  }
};

exports.forcarDescoberta = async (req, res) => {
  try {
    const { characterId, motivo } = req.body ?? {};
    const evento = await adminWorldBossEventService.forcarDescoberta({ characterId, motivo, idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao forçar a descoberta.");
  }
};

exports.despertarManualmente = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const evento = await adminWorldBossEventService.despertarManualmente({ motivo, idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao despertar manualmente.");
  }
};

exports.cancelarCicloAtual = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const evento = await adminWorldBossEventService.cancelarCicloAtual({ motivo, idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { evento } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar o ciclo atual.");
  }
};
