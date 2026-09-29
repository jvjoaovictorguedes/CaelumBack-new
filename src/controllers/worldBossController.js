const worldBossStatusService = require("../services/worldBossStatusService");
const worldBossRankingService = require("../services/worldBossRankingService");

exports.obterStatus = async (req, res) => {
  try {
    const status = await worldBossStatusService.obterStatusPublico();
    res.status(200).json({ status: "success", data: status });
  } catch (error) {
    console.error("Erro ao obter status da Ameaça Mundial:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter o status da Ameaça Mundial." });
  }
};

// GET /api/world-boss/ranking?limit=10 (§17.4) — ativo ou o último
// concluído; nunca exige personagem autenticado (só a rota /me exige).
exports.obterRanking = async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const ranking = await worldBossRankingService.obterRanking({ limit });
    res.status(200).json({ status: "success", data: ranking });
  } catch (error) {
    console.error("Erro ao obter ranking da Ameaça Mundial:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter o ranking da Ameaça Mundial." });
  }
};

// GET /api/world-boss/ranking/me — posição do personagem autenticado,
// mesmo fora do Top N (§10.2 — nunca esconder a própria posição).
exports.obterMinhaPosicaoNoRanking = async (req, res) => {
  try {
    const ranking = await worldBossRankingService.obterRanking({ characterId: req.personagemAtual.id });
    res.status(200).json({ status: "success", data: ranking });
  } catch (error) {
    console.error("Erro ao obter posição no ranking da Ameaça Mundial:", error);
    res.status(500).json({ status: "error", message: "Não foi possível obter sua posição no ranking." });
  }
};
