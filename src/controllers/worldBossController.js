const worldBossStatusService = require("../services/worldBossStatusService");

exports.obterStatus = async (req, res) => {
  try {
    const status = await worldBossStatusService.obterStatusPublico();
    res.status(200).json({ status: "success", data: status });
  } catch (error) {
    console.error("Erro ao obter status da Ameaça Mundial:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter o status da Ameaça Mundial." });
  }
};
