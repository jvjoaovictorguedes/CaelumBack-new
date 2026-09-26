const { resgatarCodigo } = require("../services/redemptionCodeService");

// POST /api/characters/:id/redemption-codes/resgatar — body: { codigo }
exports.resgatar = async (req, res) => {
  try {
    const concedido = await resgatarCodigo(req.params.id, req.body?.codigo);
    res.status(200).json({ status: "success", data: { concedido } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao resgatar código:", error);
    res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao resgatar código." });
  }
};
