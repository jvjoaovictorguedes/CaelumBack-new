const templeStatusService = require("../services/templeStatusService");

// GET /api/temple/status — §13.1/§13.2. Sempre autenticado (nunca
// público como worldboss/status): "meus_sigilos" é por personagem, não
// faz sentido devolver o mesmo payload pra todo mundo.
exports.obterStatus = async (req, res) => {
  try {
    const status = await templeStatusService.obterStatusPublico(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: status });
  } catch (error) {
    console.error("Erro ao obter status do Templo:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter o status do Templo." });
  }
};
