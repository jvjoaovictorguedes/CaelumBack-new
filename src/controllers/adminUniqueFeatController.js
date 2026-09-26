// Painel Administrativo — Proezas Únicas. Controller fino, delega pro
// adminUniqueFeatService.
const adminUniqueFeatService = require("../services/adminUniqueFeatService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const feats = await adminUniqueFeatService.listAdminUniqueFeats();
    res.status(200).json({ status: "success", data: { feats } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar Proezas Únicas.");
  }
};

exports.criar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.createAdminUniqueFeat(req.body ?? {}, { idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar Proeza Única.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const feat = await adminUniqueFeatService.updateAdminUniqueFeat(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { feat } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar Proeza Única.");
  }
};

exports.conceder = async (req, res) => {
  try {
    const { id_personagem, motivo } = req.body ?? {};
    const claim = await adminUniqueFeatService.grantUniqueFeatToCharacter(req.params.id, id_personagem, {
      idAdmin: req.user.id,
      req,
      motivo,
    });
    res.status(201).json({ status: "success", data: { claim } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao conceder Proeza Única.");
  }
};
