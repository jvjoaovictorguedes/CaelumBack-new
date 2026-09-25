// Controller fino — toda a lógica mora nos services (mesmo padrão de
// alchemyController.js/forgeController.js). Personagem sempre vem de
// req.personagemAtual (nunca id_personagem arbitrário do payload).
const fishingService = require("../services/fishingService");
const fishingRodService = require("../services/fishingRodService");
const fishingNavigationService = require("../services/fishingNavigationService");
const fishingCatalogService = require("../services/fishingCatalogService");
const fishingProgressionService = require("../services/fishingProgressionService");
const fishingRankingService = require("../services/fishingRankingService");
const fishingTournamentService = require("../services/fishingTournamentService");

function tratarErro(res, error, mensagemPadrao) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemPadrao, error);
  res.status(statusCode).json({ message: error.statusCode ? error.message : mensagemPadrao });
}

exports.getProgresso = async (req, res) => {
  try {
    const progresso = await fishingProgressionService.obterProgresso(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { progresso } });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar progresso de Pesca.");
  }
};

exports.getZonas = async (req, res) => {
  try {
    const zonas = await fishingCatalogService.listarZonas();
    res.status(200).json({ status: "success", data: { zonas } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar zonas de pesca.");
  }
};

exports.getZonaEspecies = async (req, res) => {
  try {
    const especies = await fishingCatalogService.listarEspeciesDaZona(Number(req.params.id));
    res.status(200).json({ status: "success", data: { especies } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar espécies da zona.");
  }
};

exports.getRods = async (req, res) => {
  try {
    const varas = await fishingRodService.listarVarasDoPersonagem(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { varas } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar varas.");
  }
};

exports.getLoadout = async (req, res) => {
  try {
    const loadout = await fishingRodService.obterLoadout(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { loadout } });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar loadout de pesca.");
  }
};

exports.putLoadoutRod = async (req, res) => {
  try {
    const resultado = await fishingRodService.definirVaraAtiva(req.personagemAtual.id, req.body.id_instancia_vara ?? null);
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    tratarErro(res, error, "Erro ao definir vara ativa.");
  }
};

exports.getBaits = async (req, res) => {
  try {
    const iscas = await fishingCatalogService.listarIscas(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { iscas } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar iscas.");
  }
};

exports.getAlmanac = async (req, res) => {
  try {
    const especies = await fishingCatalogService.listarAlmanaque(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { especies } });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar almanaque marinho.");
  }
};

// GET /fishing/ranking?type=total|biggest&page=1
const TIPOS_RANKING_VALIDOS = ["total", "biggest"];
exports.getRanking = async (req, res) => {
  const { type, page } = req.query;
  const tipo = TIPOS_RANKING_VALIDOS.includes(type) ? type : "total";
  try {
    let dados;
    if (tipo === "biggest") {
      dados = await fishingRankingService.rankingPescaMaiorPeixe(page);
      dados.minhaPosicao = await fishingRankingService.posicaoPescaMaiorPeixe(req.personagemAtual.id);
    } else {
      dados = await fishingRankingService.rankingPescaTotal(page);
      dados.minhaPosicao = await fishingRankingService.posicaoPescaTotal(req.personagemAtual.id);
    }
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar ranking de Pesca.");
  }
};

// GET /fishing/tournament — torneio atual (em andamento ou próximo) com
// leaderboard e a posição do personagem, tudo materializado na leitura.
exports.getTorneioAtual = async (req, res) => {
  try {
    const { torneio, status } = await fishingTournamentService.obterTorneioAtual();
    if (!torneio) {
      return res.status(200).json({ status: "success", data: { torneio: null, statusTorneio: "NENHUM", leaderboard: null, minhaPosicao: null } });
    }
    const leaderboard = await fishingTournamentService.listarLeaderboardTorneio(torneio.id, req.query.page);
    const minhaPosicao = await fishingTournamentService.obterMinhaPosicaoTorneio(torneio.id, req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { torneio, statusTorneio: status, leaderboard, minhaPosicao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar torneio de Pesca.");
  }
};

exports.getSessaoAtiva = async (req, res) => {
  try {
    const sessao = await fishingService.obterSessaoAtiva(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { sessao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar sessão de pesca ativa.");
  }
};

exports.postStart = async (req, res) => {
  try {
    const { zoneId, rodInstanceId, baitItemId } = req.body;
    const sessao = await fishingService.iniciarSessao(req.personagemAtual.id, { zoneId, rodInstanceId, baitItemId });
    res.status(201).json({ status: "success", data: { sessao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao iniciar sessão de pesca.");
  }
};

exports.postCast = async (req, res) => {
  try {
    const sessao = await fishingService.lancar(req.personagemAtual.id, Number(req.params.id));
    res.status(200).json({ status: "success", data: { sessao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao lançar a linha.");
  }
};

exports.postHook = async (req, res) => {
  try {
    const sessao = await fishingService.fisgar(req.personagemAtual.id, Number(req.params.id));
    res.status(200).json({ status: "success", data: { sessao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao fisgar.");
  }
};

exports.postReel = async (req, res) => {
  try {
    const sessao = await fishingService.recolher(req.personagemAtual.id, Number(req.params.id), Boolean(req.body.active));
    res.status(200).json({ status: "success", data: { sessao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao recolher a linha.");
  }
};

exports.postAbandon = async (req, res) => {
  try {
    const sessao = await fishingService.abandonar(req.personagemAtual.id, Number(req.params.id));
    res.status(200).json({ status: "success", data: { sessao } });
  } catch (error) {
    tratarErro(res, error, "Erro ao abandonar sessão de pesca.");
  }
};

exports.getPorts = async (req, res) => {
  try {
    const portos = await fishingNavigationService.listarPortos();
    res.status(200).json({ status: "success", data: { portos } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar portos.");
  }
};

exports.getVessels = async (req, res) => {
  try {
    const embarcacoes = await fishingNavigationService.listarEmbarcacoes(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { embarcacoes } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar embarcações.");
  }
};

exports.getRoutes = async (req, res) => {
  try {
    const rotas = await fishingNavigationService.listarRotas();
    res.status(200).json({ status: "success", data: { rotas } });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar rotas marítimas.");
  }
};

exports.postAcquireVessel = async (req, res) => {
  try {
    const posse = await fishingNavigationService.adquirirEmbarcacao(req.personagemAtual.id, Number(req.params.id));
    res.status(201).json({ status: "success", data: { posse } });
  } catch (error) {
    tratarErro(res, error, "Erro ao adquirir embarcação.");
  }
};

exports.postTravel = async (req, res) => {
  try {
    const estado = await fishingNavigationService.viajar(req.personagemAtual.id, Number(req.body.routeId));
    res.status(200).json({ status: "success", data: { estado } });
  } catch (error) {
    tratarErro(res, error, "Erro ao viajar.");
  }
};

exports.getNavigationState = async (req, res) => {
  try {
    const estado = await fishingNavigationService.obterEstado(req.personagemAtual.id);
    res.status(200).json({ status: "success", data: { estado } });
  } catch (error) {
    tratarErro(res, error, "Erro ao buscar estado de navegação.");
  }
};
