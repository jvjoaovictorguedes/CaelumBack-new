const adminGuildJournalService = require("../services/adminGuildJournalService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.listar = async (req, res) => {
  try {
    const { pagina, porPagina, status, categoria, nome } = req.query;
    const resultado = await adminGuildJournalService.listAdminGuildJournalEntries({
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      status,
      categoria,
      nome,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar o Jornal da Guilda.");
  }
};

exports.criar = async (req, res) => {
  try {
    const nota = await adminGuildJournalService.createAdminGuildJournalEntry(req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(201).json({ status: "success", data: { nota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao criar nota do Jornal da Guilda.");
  }
};

exports.atualizar = async (req, res) => {
  try {
    const nota = await adminGuildJournalService.updateAdminGuildJournalEntry(req.params.id, req.body ?? {}, {
      idAdmin: req.user.id,
      req,
    });
    res.status(200).json({ status: "success", data: { nota } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao atualizar nota do Jornal da Guilda.");
  }
};
