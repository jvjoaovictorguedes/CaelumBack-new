// Arena Ranqueada v2 — REST (PvP v2 §15/§17/§19).
//
// O personagem que age é SEMPRE req.personagemAtual (sessão
// autenticada), nunca um id vindo do cliente. O cliente também nunca
// escolhe oponente, nunca envia vencedor/delta/tier e nunca toca o
// contador diário — tudo isso é resolvido no servidor.
const { Op } = require("sequelize");
const Character = require("../models/Character");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const rankedRatingService = require("../services/rankedRatingService");
const rankedTierService = require("../services/rankedTierService");
const rankedSeasonService = require("../services/rankedSeasonService");
const rankedDailyLimitService = require("../services/rankedDailyLimitService");
const pvpLiveSocket = require("../socket/pvpLiveSocket");
const rankedLiveSocket = require("../socket/rankedLiveSocket");
const { LEADERBOARD_MINIMO_PARTIDAS, LEADERBOARD_TAMANHO_PAGINA } = require("../config/rankedConfig");

function participacaoPublica(participacao) {
  return {
    ...rankedTierService.resumoTier(participacao.rating),
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
    diasRestantes: rankedSeasonService.diasRestantes(temporada),
  };
}

// GET /api/pvp/ranked/status — §15.
// Só dados da TEMPORADA ATUAL e só ranqueado: vitórias/derrotas casuais
// (PvpStatus) nunca entram aqui.
async function status(req, res) {
  try {
    const personagem = req.personagemAtual;
    const chave = pvpLiveSocket.chaveOnline(personagem.id);

    const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
    const participacao = await rankedRatingService.obterOuCriarParticipacao(personagem.id, temporada.id);
    const uso = await rankedDailyLimitService.consultarUso(personagem.id);

    const duelId = pvpLiveSocket.duelPorPersonagem.get(chave);
    const duelo = duelId ? pvpLiveSocket.duelos.get(duelId) : null;
    const emPartidaRanked = Boolean(duelo?.ranked);

    return res.json({
      temporada: temporadaPublica(temporada),
      participacao: participacaoPublica(participacao),
      limiteDiario: {
        usadas: uso.usadas,
        limite: uso.limite,
        restantes: uso.restantes,
        rotulo: `${uso.usadas}/${uso.limite}`,
      },
      emPartidaRanked,
      duelId: emPartidaRanked ? duelId : null,
    });
  } catch (error) {
    console.error("Erro ao consultar status ranqueado:", error);
    return res.status(500).json({ message: "Erro ao consultar status ranqueado." });
  }
}

// POST /api/pvp/ranked/match/start — §6/§17.
// Substitui a antiga entrada na fila. Qualquer alvo enviado no corpo é
// IGNORADO de propósito: a escolha do oponente é exclusivamente do
// servidor.
async function iniciarPartida(req, res) {
  try {
    const personagem = req.personagemAtual;

    if (req.body && (req.body.id_oponente || req.body.idOponente || req.body.opponentId)) {
      console.warn(
        `[ranked] Tentativa de escolher oponente ignorada (personagem ${personagem.id}) — o servidor sempre seleciona.`,
      );
    }

    const resultado = await rankedLiveSocket.iniciarPartidaAssincrona(req.app.get("io"), {
      idDesafiante: personagem.id,
    });

    return res.status(201).json({
      duelId: resultado.duelId,
      rankedMatchId: resultado.rankedMatchId,
      temporada: temporadaPublica(resultado.temporada),
      desafiante: resultado.desafiante,
      defensor: resultado.defensor,
      limiteDiario: {
        usadas: resultado.uso.usadas,
        limite: resultado.uso.limite,
        restantes: Math.max(0, resultado.uso.limite - resultado.uso.usadas),
        rotulo: `${resultado.uso.usadas}/${resultado.uso.limite}`,
      },
      consumiveisHabilitados: false,
    });
  } catch (error) {
    if (error instanceof rankedLiveSocket.RankedMatchError) {
      return res.status(error.status).json({ codigo: error.codigo, message: error.message });
    }
    console.error("Erro ao iniciar partida ranqueada:", error);
    return res.status(500).json({ message: "Erro ao iniciar partida ranqueada." });
  }
}

// DEPRECATED (PvP v2 §19): matchmaking por fila foi removido. Mantido
// respondendo 410 Gone com instrução explícita, pra um cliente antigo
// falhar de forma clara em vez de ficar esperando um match que nunca vem.
function filaRemovida(req, res) {
  return res.status(410).json({
    codigo: "fila-removida",
    message:
      "A fila ranqueada foi removida no PvP v2. Use POST /api/pvp/ranked/match/start para iniciar uma partida.",
  });
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

// GET /api/pvp/ranked/leaderboard — §14: aparece desde a 1ª partida
// válida da temporada; 0 partidas não é listado.
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
      ...rankedTierService.resumoTier(linha.rating),
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

module.exports = { status, iniciarPartida, filaRemovida, season, leaderboard };
