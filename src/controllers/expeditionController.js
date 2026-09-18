// src/controllers/expeditionController.js
// Fino de propósito — toda a matemática de sorteio/progressão mora em
// services/expedition*, este arquivo só valida entrada de HTTP e
// formata a resposta (ver seção 29 da especificação de Expedição).
const expeditionService = require("../services/expeditionService");

// GET /api/expeditions/professions
exports.getProfissoes = async (req, res) => {
  try {
    const profissoes = await expeditionService.listarProfissoes(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { profissoes } });
  } catch (error) {
    console.error("Erro ao buscar profissões de expedição:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar profissões." });
  }
};

// GET /api/expeditions/regions?profissao=Mineracao
exports.getRegioes = async (req, res) => {
  try {
    const { profissao } = req.query;
    const profissoesValidas = ["Mineracao", "Silvicultura", "Exploracao"];
    if (profissao && !profissoesValidas.includes(profissao)) {
      return res.status(400).json({ message: "Profissão inválida." });
    }

    const regioes = await expeditionService.listarRegioes(req.personagemAtual.id, profissao);
    res.status(200).json({ status: "success", data: { regioes } });
  } catch (error) {
    console.error("Erro ao buscar regiões de expedição:", error);
    res.status(500).json({ message: "Erro interno do servidor ao buscar regiões." });
  }
};

// POST /api/expeditions/regions/:regionId/collect
// Sem body — o cliente não envia (nem pode influenciar) profissão,
// nível, qualidade, quantidade, xp ou item: tudo é derivado no
// servidor a partir do personagem logado e da região na URL.
exports.coletar = async (req, res) => {
  try {
    const id_regiao = Number.parseInt(req.params.regionId, 10);
    if (!Number.isInteger(id_regiao)) {
      return res.status(400).json({ message: "Região inválida." });
    }

    const resultado = await expeditionService.coletar(req.personagemAtual.id, id_regiao);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao coletar expedição:", error);
    const payload = { message: error.statusCode ? error.message : "Erro interno do servidor ao coletar expedição." };
    if (error.disponivelEmMs !== undefined) payload.disponivelEmMs = error.disponivelEmMs;
    res.status(statusCode).json(payload);
  }
};
