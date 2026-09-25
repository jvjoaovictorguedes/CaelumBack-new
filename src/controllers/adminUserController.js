// Painel Administrativo — Excluir Contas de Usuário. Controller fino;
// toda a regra (proteção de conta admin, trava de guilda, auditoria)
// mora em adminUserService.js.
const adminUserService = require("../services/adminUserService");

exports.listarUsuarios = async (req, res) => {
  try {
    const { busca, pagina, porPagina } = req.query;
    const resultado = await adminUserService.listUsers({ busca, pagina, porPagina });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    console.error("Erro ao listar usuários (admin):", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar usuários." });
  }
};

exports.listarIdsElegiveis = async (req, res) => {
  try {
    const { busca } = req.query;
    const ids = await adminUserService.listEligibleUserIds({ busca });
    res.status(200).json({ status: "success", data: { ids } });
  } catch (error) {
    console.error("Erro ao listar ids de usuários (admin):", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar usuários." });
  }
};

exports.excluirEmLote = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "Informe ao menos um id de usuário pra excluir." });
    }
    const resultado = await adminUserService.bulkDeleteUsers(ids, { idAdmin: req.user.id, req });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    console.error("Erro ao excluir usuários em lote (admin):", error);
    res.status(500).json({ message: "Erro interno do servidor ao excluir usuários." });
  }
};
