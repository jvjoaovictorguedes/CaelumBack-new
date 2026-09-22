// src/controllers/worldMapController.js
// Fino de propósito — toda a agregação mora em worldMapService.js.
const worldMapService = require("../services/worldMapService");

// GET /api/world/map
exports.obterMapa = async (req, res) => {
  try {
    const mapa = await worldMapService.obterMapaMundial(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: mapa });
  } catch (error) {
    console.error("Erro ao montar o Mapa Mundial:", error);
    res.status(500).json({ message: "Erro interno do servidor ao montar o mapa." });
  }
};
