const adminMarketService = require("../services/adminMarketService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listarAnuncios = async (req, res) => {
  try {
    const { pagina, porPagina, status, idItem, vendedorId } = req.query;
    const resultado = await adminMarketService.listAdminMarketListings({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      status,
      idItem: idItem ? Number(idItem) : undefined,
      vendedorId: vendedorId ? Number(vendedorId) : undefined,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar anúncios.");
  }
};

exports.cancelarAnuncio = async (req, res) => {
  try {
    const { motivo } = req.body ?? {};
    const listing = await adminMarketService.cancelAdminMarketListing(req.params.id, {
      idAdmin: req.user.id,
      motivo,
      req,
    });
    res.status(200).json({ status: "success", data: { listing } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao cancelar anúncio.");
  }
};

exports.listarTransacoes = async (req, res) => {
  try {
    const { pagina, porPagina, idItem, vendedorId, compradorId } = req.query;
    const resultado = await adminMarketService.listAdminMarketTransactions({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      idItem: idItem ? Number(idItem) : undefined,
      vendedorId: vendedorId ? Number(vendedorId) : undefined,
      compradorId: compradorId ? Number(compradorId) : undefined,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar histórico de vendas.");
  }
};
