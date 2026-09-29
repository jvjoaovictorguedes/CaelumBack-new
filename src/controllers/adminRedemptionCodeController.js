// Painel Administrativo — Códigos de Resgate. Controller fino, toda
// lógica em redemptionCodeService.js (mesmo padrão de adminGrantController).
const redemptionCodeService = require("../services/redemptionCodeService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const codigos = await redemptionCodeService.listarCodigosAdmin();
    res.status(200).json({ status: "success", data: { codigos } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar códigos.");
  }
};

exports.criar = async (req, res) => {
  try {
    const codigo = await redemptionCodeService.criarCodigo({ ...(req.body ?? {}), idAdmin: req.user.id, req });
    res.status(201).json({ status: "success", data: { codigo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar código.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const codigo = await redemptionCodeService.atualizarCodigo(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { codigo } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar código.");
  }
};
