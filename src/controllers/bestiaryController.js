// Controller do Bestiário — só valida a requisição e delega pra
// bestiaryService.js (§27/§29 da spec). Tudo sai de req.personagemAtual,
// nunca de um characterId vindo do cliente.
const { listarRegioes, obterRegiao } = require("../services/bestiaryService");

// GET /api/bestiary
exports.listarRegioes = async (req, res) => {
  try {
    const dados = await listarRegioes(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao listar Bestiário:", error);
    res.status(500).json({ message: "Erro interno do servidor ao listar o Bestiário." });
  }
};

// GET /api/bestiary/regions/:regionId
exports.obterRegiao = async (req, res) => {
  const idZona = Number.parseInt(req.params.regionId, 10);
  if (!Number.isInteger(idZona)) {
    return res.status(400).json({ message: "Região inválida." });
  }

  try {
    const dados = await obterRegiao(req.personagemAtual.id, idZona);
    if (!dados) {
      return res.status(404).json({ message: "Região não encontrada." });
    }
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter região do Bestiário:", error);
    res.status(500).json({ message: "Erro interno do servidor ao obter a região." });
  }
};
