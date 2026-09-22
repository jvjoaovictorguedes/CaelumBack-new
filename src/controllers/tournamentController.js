// Torneios (PvP v2 §16/§17) — rotas de jogador e de administrador.
//
// Criação/início/cancelamento/prêmio passam por authMiddleware +
// adminMiddleware (checagem real de User.isAdmin, nunca uma flag do
// cliente). O personagem que se inscreve é sempre req.personagemAtual.
const tournamentService = require("../services/tournamentService");
const tournamentStatsService = require("../services/tournamentStatsService");
const TournamentParticipant = require("../models/TournamentParticipant");

function responderErro(res, error, mensagemPadrao) {
  if (error instanceof tournamentService.TournamentError) {
    return res.status(error.status).json({ codigo: error.codigo, message: error.message });
  }
  console.error(mensagemPadrao, error);
  return res.status(500).json({ message: mensagemPadrao });
}

function torneioPublico(torneio, extras = {}) {
  return {
    id: torneio.id,
    name: torneio.name,
    description: torneio.description,
    level_min: torneio.level_min,
    level_max: torneio.level_max,
    starts_at: torneio.starts_at,
    max_participants: torneio.max_participants,
    prize_description: torneio.prize_description,
    status: torneio.status,
    prize_delivered: torneio.prize_delivered,
    // bracket_seed é exposto só como dado de leitura do chaveamento já
    // sorteado — nunca aceito como entrada.
    bracket: torneio.bracket_seed ?? null,
    ...extras,
  };
}

// GET /api/pvp/tournaments
exports.listar = async (req, res) => {
  try {
    const torneios = await tournamentService.listar({ status: req.query.status });
    return res.json({ itens: torneios.map((t) => torneioPublico(t)) });
  } catch (error) {
    return responderErro(res, error, "Erro ao listar torneios.");
  }
};

// GET /api/pvp/tournaments/:id
exports.detalhar = async (req, res) => {
  try {
    const torneio = await tournamentService.detalhar(req.params.id);
    return res.json({
      torneio: torneioPublico(torneio, {
        participantes: (torneio.participantes ?? []).map((p) => ({
          id: p.id,
          characterId: p.character_id,
          nome: p.personagem?.nome ?? "???",
          nivel: p.personagem?.nivel ?? null,
          seed: p.seed,
          eliminado: p.eliminated,
          colocacao: p.final_placement,
        })),
        series: (torneio.series ?? []).map((s) => ({
          id: s.id,
          round: s.round,
          posicao: s.posicao,
          participanteA: s.participant_a_id,
          participanteB: s.participant_b_id,
          formato: s.format,
          placar: { a: s.score_a, b: s.score_b },
          vencedor: s.winner_participant_id,
          status: s.status,
          readyCheckExpiraEm: s.ready_check_expira_em,
        })),
      }),
    });
  } catch (error) {
    return responderErro(res, error, "Erro ao detalhar torneio.");
  }
};

// POST /api/pvp/tournaments/:id/join
exports.inscrever = async (req, res) => {
  try {
    const participante = await tournamentService.inscrever({
      torneioId: req.params.id,
      personagem: req.personagemAtual,
    });
    return res.status(201).json({ participanteId: participante.id });
  } catch (error) {
    return responderErro(res, error, "Erro ao se inscrever no torneio.");
  }
};

// POST /api/pvp/tournaments/:id/leave
exports.desinscrever = async (req, res) => {
  try {
    await tournamentService.desinscrever({
      torneioId: req.params.id,
      personagem: req.personagemAtual,
    });
    return res.json({ ok: true });
  } catch (error) {
    return responderErro(res, error, "Erro ao sair do torneio.");
  }
};

// GET /api/pvp/tournaments/me/podium — pódio/troféus derivados (§16).
exports.meuPodio = async (req, res) => {
  try {
    const podio = await tournamentStatsService.podioDoPersonagem(req.personagemAtual.id);
    const historico = await tournamentStatsService.historicoDoPersonagem(req.personagemAtual.id);
    return res.json({ podio, historico });
  } catch (error) {
    return responderErro(res, error, "Erro ao consultar pódio de torneios.");
  }
};

// POST /api/admin/pvp/tournaments
exports.criar = async (req, res) => {
  try {
    const torneio = await tournamentService.criar({
      criadoPorUserId: req.user.id,
      dados: req.body ?? {},
    });
    return res.status(201).json({ torneio: torneioPublico(torneio) });
  } catch (error) {
    return responderErro(res, error, "Erro ao criar torneio.");
  }
};

// POST /api/admin/pvp/tournaments/:id/start
exports.iniciar = async (req, res) => {
  try {
    const { torneio, bracketSeed } = await tournamentService.iniciar({ torneioId: req.params.id });
    return res.json({ torneio: torneioPublico(torneio), bracket: bracketSeed });
  } catch (error) {
    return responderErro(res, error, "Erro ao iniciar torneio.");
  }
};

// POST /api/admin/pvp/tournaments/:id/cancel
exports.cancelar = async (req, res) => {
  try {
    const torneio = await tournamentService.cancelar({
      torneioId: req.params.id,
      motivo: req.body?.motivo,
      adminUserId: req.user.id,
    });
    return res.json({ torneio: torneioPublico(torneio) });
  } catch (error) {
    return responderErro(res, error, "Erro ao cancelar torneio.");
  }
};

// POST /api/admin/pvp/tournaments/:id/prize-delivered
exports.marcarPremioEntregue = async (req, res) => {
  try {
    const torneio = await tournamentService.marcarPremioEntregue({
      torneioId: req.params.id,
      entregue: req.body?.entregue,
      adminUserId: req.user.id,
    });
    return res.json({ torneio: torneioPublico(torneio) });
  } catch (error) {
    return responderErro(res, error, "Erro ao marcar prêmio como entregue.");
  }
};

// POST /api/admin/pvp/tournaments/series/:serieId/resolve — resolução
// manual de série que caiu em PendenteAdm (ninguém confirmou o ready
// check). O sistema nunca escolhe sozinho nesse caso (§16).
exports.resolverSerie = async (req, res) => {
  try {
    const tournamentMatchService = require("../services/tournamentMatchService");
    const vencedorParticipantId = Number(req.body?.vencedorParticipantId);
    if (!Number.isInteger(vencedorParticipantId)) {
      return res.status(400).json({ message: "vencedorParticipantId é obrigatório." });
    }
    const serie = await tournamentMatchService.finalizarSerie({
      serieId: req.params.serieId,
      vencedorParticipantId,
      porWO: true,
    });
    const participantes = await TournamentParticipant.findAll({
      where: { tournament_id: serie.tournament_id },
      attributes: ["id", "character_id", "final_placement", "eliminated"],
    });
    console.log(
      `[torneio] admin:serie-resolvida ${JSON.stringify({ serie: serie.id, admin: req.user.id, vencedor: vencedorParticipantId })}`,
    );
    return res.json({ serieId: serie.id, status: serie.status, participantes });
  } catch (error) {
    return responderErro(res, error, "Erro ao resolver série.");
  }
};
