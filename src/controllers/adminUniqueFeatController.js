// Painel Administrativo — Sistema de Proezas Únicas §19. Controller
// fino, delega tudo pro adminUniqueFeatService.
const adminUniqueFeatService = require("../services/adminUniqueFeatService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// ------------------------------------------------------- 19.1 PROEZAS
exports.listar = async (req, res) => {
  try {
    const { nome, trigger_key, ativa, conquistada, categoria } = req.query;
    const feats = await adminUniqueFeatService.listAdminUniqueFeats({ nome, trigger_key, ativa, conquistada, categoria });
    res.status(200).json({ status: "success", data: { itens: feats } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar Proezas Únicas.");
  }
};

exports.obter = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.obterAdminUniqueFeat(req.params.id);
    res.status(200).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter a Proeza.");
  }
};

exports.criar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.createAdminUniqueFeat(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar a Proeza.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.updateAdminUniqueFeat(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro ao atualizar a Proeza.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.duplicateAdminUniqueFeat(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro ao duplicar a Proeza.");
  }
};

exports.desativar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.setAtivoAdminUniqueFeat(req.params.id, false, {
      idAdmin: req.user.id,
      req,
      motivo: req.body?.motivo,
    });
    res.status(200).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro ao desativar a Proeza.");
  }
};

exports.reativar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.setAtivoAdminUniqueFeat(req.params.id, true, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro ao reativar a Proeza.");
  }
};

// ------------------------------------------------------- 19.2 LEGADOS
exports.obterLegado = async (req, res) => {
  try {
    const dados = await adminUniqueFeatService.getUniquePowerEffect(req.params.idPower);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter o Legado.");
  }
};

exports.atualizarLegado = async (req, res) => {
  try {
    const efeito = await adminUniqueFeatService.upsertUniquePowerEffect(req.params.idPower, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { efeito } });
  } catch (error) {
    tratarErro(res, error, "Erro ao atualizar o Legado.");
  }
};

// ------------------------------------------------------ 19.3 TRIGGERS
exports.listarTriggers = async (req, res) => {
  try {
    res.status(200).json({ status: "success", data: { itens: adminUniqueFeatService.listarTriggerSchemas() } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar triggers.");
  }
};

exports.obterTrigger = async (req, res) => {
  try {
    res.status(200).json({ status: "success", data: adminUniqueFeatService.obterTriggerSchema(req.params.triggerKey) });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter o trigger.");
  }
};

exports.validarTrigger = async (req, res) => {
  try {
    const resultado = adminUniqueFeatService.validarConfiguracaoDeTrigger(req.body?.trigger_key, req.body?.trigger_config);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao validar a configuração do trigger.");
  }
};

// -------------------------------------------------- 19.4 HISTÓRICO/REPARO
exports.listarClaims = async (req, res) => {
  try {
    const { idPersonagem, trigger_key, status } = req.query;
    const claims = await adminUniqueFeatService.listAdminClaims({ idPersonagem, trigger_key, status });
    res.status(200).json({ status: "success", data: { itens: claims } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar o histórico de claims.");
  }
};

exports.revogarClaim = async (req, res) => {
  try {
    const claim = await adminUniqueFeatService.revogarClaim(req.params.id, { motivo: req.body?.motivo, idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { claim } });
  } catch (error) {
    tratarErro(res, error, "Erro ao revogar a claim.");
  }
};

exports.transferirClaim = async (req, res) => {
  try {
    const claim = await adminUniqueFeatService.transferirClaim(req.params.id, {
      idPersonagemNovo: req.body?.idPersonagemNovo,
      motivo: req.body?.motivo,
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { claim } });
  } catch (error) {
    tratarErro(res, error, "Erro ao transferir a claim.");
  }
};
