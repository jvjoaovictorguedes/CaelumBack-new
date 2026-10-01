// Loja do Aventureiro V2 — controller fino, delega pro playerShopService
// (mesmo padrão do resto do projeto).
const playerShopService = require("../services/playerShopService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

// GET /api/player-shops?busca=&profissao=&aceita_encomendas=&page=&limit=
exports.listarLojas = async (req, res) => {
  try {
    const { busca, profissao, aceita_encomendas, page, limit } = req.query;
    const resultado = await playerShopService.listarLojasPublicas({
      busca,
      profissao,
      aceitaEncomendas: aceita_encomendas !== undefined ? aceita_encomendas === "true" : undefined,
      page,
      limit,
    });
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao listar lojas.");
  }
};

// GET /api/player-shops/mine — vem ANTES de "/:characterId" no router.
exports.obterMinhaLoja = async (req, res) => {
  try {
    const loja = await playerShopService.obterMinhaLoja(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { loja } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar sua loja.");
  }
};

// PUT /api/player-shops/mine
exports.atualizarMinhaLoja = async (req, res) => {
  try {
    const loja = await playerShopService.criarOuAtualizarLoja(req.personagemAtual.id, req.body ?? {});
    res.status(200).json({ status: "success", data: { loja } });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao salvar sua loja.");
  }
};

// GET /api/player-shops/:characterId
exports.obterLoja = async (req, res) => {
  try {
    const characterId = Number(req.params.characterId);
    if (!Number.isInteger(characterId)) {
      return res.status(400).json({ message: "characterId inválido." });
    }
    const perfil = await playerShopService.obterPerfilPublico(characterId);
    res.status(200).json({ status: "success", data: perfil });
  } catch (error) {
    tratarErro(res, error, "Erro interno do servidor ao carregar a loja.");
  }
};
