// Sistema de Proezas Únicas §17 — API pública (autenticada, mas sem
// nenhuma permissão de admin). Nunca cria endpoint de "progresso de
// Proeza" (§17) — o desconhecido é parte do design.
const uniqueFeatPublicService = require("../services/uniqueFeatPublicService");

function tratarErro(res, error, mensagemPadrao) {
  const status = error?.statusCode ?? 500;
  if (status >= 500) console.error(mensagemPadrao, error);
  res.status(status).json({ message: error?.message ?? mensagemPadrao });
}

// GET /api/unique-feats/hall?page=1
exports.getHall = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const dados = await uniqueFeatPublicService.obterHall({ page });
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter o Hall das Lendas.");
  }
};

// GET /api/unique-feats/me
exports.getMinhasProezas = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual?.id;
    if (!idPersonagem) return res.status(400).json({ message: "Nenhum personagem ativo." });
    const proezas = await uniqueFeatPublicService.obterProezasDoPersonagem(idPersonagem);
    res.status(200).json({ status: "success", data: { itens: proezas } });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter suas Proezas Únicas.");
  }
};

// GET /api/unique-feats/:key/public
exports.getFeatPublico = async (req, res) => {
  try {
    const feat = await uniqueFeatPublicService.obterFeatPublico(req.params.key);
    if (!feat) return res.status(404).json({ message: "Proeza não encontrada." });
    res.status(200).json({ status: "success", data: feat });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter a Proeza.");
  }
};
