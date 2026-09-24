const { listarAcoes } = require("../services/adminAuditService");

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, idAdmin, entidade, acao } = req.query;
    const resultado = await listarAcoes({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      idAdmin: idAdmin ? Number(idAdmin) : undefined,
      entidade,
      acao,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    console.error("Erro ao listar auditoria administrativa:", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar auditoria." });
  }
};
