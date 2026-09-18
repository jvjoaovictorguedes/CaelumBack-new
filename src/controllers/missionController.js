const { sequelize } = require("../config/database");
const { listarMissoes, resgatarRecompensa } = require("../services/missionService");

// GET /api/characters/:id/missions
exports.getMissoes = async (req, res) => {
  try {
    const missoes = await sequelize.transaction((transaction) =>
      listarMissoes(req.params.id, transaction),
    );
    return res.status(200).json({ status: "success", data: { missoes } });
  } catch (error) {
    console.error("Erro ao buscar missões:", error);
    return res.status(500).json({ message: "Erro interno do servidor ao buscar missões." });
  }
};

// POST /api/characters/:id/missions/:missionId/claim
exports.resgatarMissao = async (req, res) => {
  try {
    const resultado = await sequelize.transaction((transaction) =>
      resgatarRecompensa(req.params.id, req.params.missionId, transaction),
    );
    return res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao resgatar missão:", error);
    return res
      .status(statusCode)
      .json({ message: error.statusCode ? error.message : "Erro interno do servidor ao resgatar missão." });
  }
};
