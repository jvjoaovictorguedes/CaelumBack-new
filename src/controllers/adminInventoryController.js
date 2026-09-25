const adminInventoryService = require("../services/adminInventoryService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.obterInventario = async (req, res) => {
  try {
    const inventario = await adminInventoryService.getCharacterInventory(req.params.idPersonagem);
    res.status(200).json({ status: "success", data: inventario });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao consultar inventário.");
  }
};

exports.corrigirStack = async (req, res) => {
  try {
    const { quantidade, motivo } = req.body ?? {};
    const resultado = await adminInventoryService.setInventoryStackQuantity(
      req.params.idPersonagem,
      req.params.idItem,
      quantidade,
      { idAdmin: req.user.id, motivo, req },
    );
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao corrigir item.");
  }
};

exports.removerEquipamento = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const resultado = await adminInventoryService.removeEquipmentInstance(req.params.idInstancia, {
      idAdmin: req.user.id,
      motivo,
      req,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao remover equipamento.");
  }
};
