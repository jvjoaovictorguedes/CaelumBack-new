// Painel Administrativo — Templo do Véu Celestial (Provação Final /
// Guardião de um evento) — controller fino, delega tudo pro
// adminTempleBossService.
const adminTempleBossService = require("../services/adminTempleBossService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.obter = async (req, res) => {
  try {
    const dados = await adminTempleBossService.obterGuardiaoAdmin(req.params.idEvento);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao obter o Guardião.");
  }
};

exports.salvarConfig = async (req, res) => {
  try {
    const config = await adminTempleBossService.salvarConfig(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { config } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar a configuração do Guardião.");
  }
};

exports.criarFase = async (req, res) => {
  try {
    const fase = await adminTempleBossService.criarFase(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { fase } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar a fase do Guardião.");
  }
};

exports.atualizarFase = async (req, res) => {
  try {
    const fase = await adminTempleBossService.atualizarFase(req.params.idEvento, req.params.idFase, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { fase } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar a fase do Guardião.");
  }
};

exports.excluirFase = async (req, res) => {
  try {
    await adminTempleBossService.excluirFase(req.params.idEvento, req.params.idFase, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir a fase do Guardião.");
  }
};

exports.criarResistencia = async (req, res) => {
  try {
    const resistencia = await adminTempleBossService.criarResistencia(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { resistencia } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar a resistência do Guardião.");
  }
};

exports.atualizarResistencia = async (req, res) => {
  try {
    const resistencia = await adminTempleBossService.atualizarResistencia(req.params.idEvento, req.params.idResistencia, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { resistencia } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar a resistência do Guardião.");
  }
};

exports.excluirResistencia = async (req, res) => {
  try {
    await adminTempleBossService.excluirResistencia(req.params.idEvento, req.params.idResistencia, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir a resistência do Guardião.");
  }
};

exports.criarRewardEntry = async (req, res) => {
  try {
    const entry = await adminTempleBossService.criarRewardEntry(req.params.idEvento, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { entry } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar a recompensa do Guardião.");
  }
};

exports.atualizarRewardEntry = async (req, res) => {
  try {
    const entry = await adminTempleBossService.atualizarRewardEntry(req.params.idEvento, req.params.idEntry, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { entry } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar a recompensa do Guardião.");
  }
};

exports.excluirRewardEntry = async (req, res) => {
  try {
    await adminTempleBossService.excluirRewardEntry(req.params.idEvento, req.params.idEntry, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success" });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao excluir a recompensa do Guardião.");
  }
};

exports.simular = async (req, res) => {
  try {
    const { dpr, ehp } = req.body ?? {};
    const resultado = await adminTempleBossService.simularBoss(req.params.idEvento, { dpr, ehp });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular o Guardião.");
  }
};
