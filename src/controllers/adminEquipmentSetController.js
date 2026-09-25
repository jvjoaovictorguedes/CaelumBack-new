// Painel Administrativo Fase 4 — controller fino.
const adminEquipmentSetService = require("../services/adminEquipmentSetService");
const { SET_EFFECT_HANDLERS } = require("../services/equipmentSetEffectRegistry");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const sets = await adminEquipmentSetService.listAdminEquipmentSets();
    res.status(200).json({ status: "success", data: { sets } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar conjuntos.");
  }
};

exports.criar = async (req, res) => {
  try {
    const set = await adminEquipmentSetService.createAdminEquipmentSet(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { set } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar conjunto.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const set = await adminEquipmentSetService.updateAdminEquipmentSet(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { set } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar conjunto.");
  }
};

exports.duplicar = async (req, res) => {
  try {
    const set = await adminEquipmentSetService.duplicateAdminEquipmentSet(req.params.id, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { set } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao duplicar conjunto.");
  }
};

exports.adicionarPeca = async (req, res) => {
  try {
    const peca = await adminEquipmentSetService.addAdminEquipmentSetPiece(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { peca } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao adicionar peça.");
  }
};

exports.removerPeca = async (req, res) => {
  try {
    const resultado = await adminEquipmentSetService.removeAdminEquipmentSetPiece(req.params.idPeca, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover peça.");
  }
};

exports.adicionarBonus = async (req, res) => {
  try {
    const bonus = await adminEquipmentSetService.addAdminEquipmentSetBonus(req.params.id, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { bonus } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao adicionar bônus.");
  }
};

exports.atualizarBonus = async (req, res) => {
  try {
    const bonus = await adminEquipmentSetService.updateAdminEquipmentSetBonus(req.params.idBonus, req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: { bonus } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar bônus.");
  }
};

exports.removerBonus = async (req, res) => {
  try {
    const resultado = await adminEquipmentSetService.removeAdminEquipmentSetBonus(req.params.idBonus, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover bônus.");
  }
};

exports.preview = async (req, res) => {
  try {
    const quantidade = Number(req.query.pecas ?? req.body?.pecas ?? 0);
    const resultado = await adminEquipmentSetService.previewAdminEquipmentSet(req.params.id, quantidade);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao simular o conjunto.");
  }
};

exports.listarEfeitos = async (req, res) => {
  res.status(200).json({ status: "success", data: { efeitos: Object.keys(SET_EFFECT_HANDLERS) } });
};
