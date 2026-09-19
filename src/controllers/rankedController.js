// Arena Ranqueada (PvP Competitivo v1) — REST §13. Fila/pareamento/
// resultado de partida em si vivem em rankedMatchmakingService e
// rankedLiveSocket.js; este controller só expõe entrada/saída da fila e
// consultas de status/temporada/leaderboard.
const { Op } = require("sequelize");
const Character = require("../models/Character");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const rankedMatchmakingService = require("../services/rankedMatchmakingService");
const rankedRatingService = require("../services/rankedRatingService");
const rankedSeasonService = require("../services/rankedSeasonService");
const pvpLiveSocket = require("../socket/pvpLiveSocket");
const { LEADERBOARD_MINIMO_PARTIDAS, LEADERBOARD_TAMANHO_PAGINA } = require("../config/rankedConfig");

function participacaoPublica(participacao) {
  return {
    rating: participacao.rating,
    liga: rankedRatingService.ligaParaRating(participacao.rating),
    jogos: participacao.jogos,
    vitorias: participacao.vitorias,
    derrotas: participacao.derrotas,
    peak_rating: participacao.peak_rating,
  };
}

function temporadaPublica(temporada) {
  return {
    id: temporada.id,
    nome: temporada.nome,
    starts_at: temporada.starts_at,
    ends_at: temporada.ends_at,
    status: temporada.status,
  };
}

async function entrarFila(req, res) {
  try {
    const personagem = req.personagemAtual;
    const chave = pvpLiveSocket.chaveOnline(personagem.id);

    if (!pvpLiveSocket.estaOnline(personagem.id)) {
      return res.status(400).json({
        erro: "Conecte-se ao Duelo ao vivo antes de entrar na fila ranqueada.",
      });
    }
    if (pvpLiveSocket.duelPorPersonagem.has(chave)) {
      return res.status(409).json({ message: "Você já está em um duelo." });
    }
    if (rankedMatchmakingService.estaNaFila(chave)) {
      return res.status(409).json({ message: "Você já está na fila ranqueada." });
    }

    const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
    const participacao = await rankedRatingService.obterOuCriarParticipacao(personagem.id, temporada.id);

    rankedMatchmakingService.entrar(chave, participacao.rating);

    const socketId = pvpLiveSocket.online.get(chave);
    if (socketId) {
      req.app.get("io")?.to(socketId).emit("ranked:queue:update", {
        emFila: true,
        tempoNaFilaMs: 0,
      });
    }

    return res.json({
      emFila: true,
      temporada: temporadaPublica(temporada),
      participacao: participacaoPublica(participacao),
    });
  } catch (error) {
    console.error("Erro ao entrar na fila ranqueada:", error);
    return res.status(500).json({ message: "Erro ao entrar na fila ranqueada." });
  }
}

async function sairFila(req, res) {
  try {
    const personagem = req.personagemAtual;
    const chave = pvpLiveSocket.chaveOnline(personagem.id);
    const saiu = rankedMatchmakingService.sair(chave);

    const socketId = pvpLiveSocket.online.get(chave);
    if (socketId) {
      req.app.get("io")?.to(socketId).emit("ranked:queue:update", { emFila: false });
    }

    return res.json({ emFila: false, saiu });
  } catch (error) {
    console.error("Erro ao sair da fila ranqueada:", error);
    return res.status(500).json({ message: "Erro ao sair da fila ranqueada." });
  }
}

async function status(req, res) {
  try {
    const personagem = req.personagemAtual;
    const chave = pvpLiveSocket.chaveOnline(personagem.id);

    const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
    const participacao = await rankedRatingService.obterOuCriarParticipacao(personagem.id, temporada.id);

    const emFila = rankedMatchmakingService.estaNaFila(chave);
    const tempoNaFilaMs = emFila ? rankedMatchmakingService.tempoNaFilaMs(chave) : null;

    const duelId = pvpLiveSocket.duelPorPersonagem.get(chave);
    const duelo = duelId ? pvpLiveSocket.duelos.get(duelId) : null;
    const emPartidaRanked = Boolean(duelo?.ranked);

    return res.json({
      temporada: temporadaPublica(temporada),
      participacao: participacaoPublica(participacao),
      emFila,
      tempoNaFilaMs,
      emPartidaRanked,
      duelId: emPartidaRanked ? duelId : null,
    });
  } catch (error) {
    console.error("Erro ao consultar status ranqueado:", error);
    return res.status(500).json({ message: "Erro ao consultar status ranqueado." });
  }
}

async function season(req, res) {
  try {
    const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
    return res.json({ temporada: temporadaPublica(temporada) });
  } catch (error) {
    console.error("Erro ao consultar temporada ranqueada:", error);
    return res.status(500).json({ message: "Erro ao consultar temporada ranqueada." });
  }
}

// §15 — só entram no leaderboard público quem tem o mínimo configurável
// de partidas; isso nunca afeta o rating interno, só a visibilidade.
async function leaderboard(req, res) {
  try {
    const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
    const pagina = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limite = LEADERBOARD_TAMANHO_PAGINA;
    const offset = (pagina - 1) * limite;

    const { count, rows } = await CharacterPvpSeason.findAndCountAll({
      where: { season_id: temporada.id, jogos: { [Op.gte]: LEADERBOARD_MINIMO_PARTIDAS } },
      include: [{ model: Character, as: "personagem", attributes: ["id", "nome"] }],
      order: [
        ["rating", "DESC"],
        ["vitorias", "DESC"],
        ["jogos", "ASC"],
      ],
      limit: limite,
      offset,
    });

    const itens = rows.map((linha, indice) => ({
      posicao: offset + indice + 1,
      id: linha.character_id,
      nome: linha.personagem?.nome ?? "???",
      rating: linha.rating,
      liga: rankedRatingService.ligaParaRating(linha.rating),
      jogos: linha.jogos,
      vitorias: linha.vitorias,
      derrotas: linha.derrotas,
      peak_rating: linha.peak_rating,
      online: pvpLiveSocket.estaOnline(linha.character_id),
    }));

    return res.json({
      temporada: temporadaPublica(temporada),
      itens,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(count / limite)),
      totalItens: count,
    });
  } catch (error) {
    console.error("Erro ao consultar leaderboard ranqueado:", error);
    return res.status(500).json({ message: "Erro ao consultar leaderboard ranqueado." });
  }
}

module.exports = { entrarFila, sairFila, status, season, leaderboard };
