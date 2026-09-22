// Pódio do perfil (PvP v2 — ajuste pós-lançamento): Troféu e Medalhas
// deixaram de vir os dois do mesmo lugar.
//
// - Troféu: continua sendo o torneio — quantidade de CAMPEONATOS
//   (final_placement === 1 em Tournament.status === "Finalizado"),
//   derivado por agregação de tournament_participants, sem contador
//   manual.
// - Medalhas (Ouro/Prata/Bronze): passam a ser da Arena Ranqueada — 1º/
//   2º/3º lugar no leaderboard de uma TEMPORADA ENCERRADA, não mais de
//   pódio de Torneio (ver rankedSeasonService.medalhasDoPersonagem).
//   Torneio hoje só concede o Troféu; 2º e 3º lugar de Torneio não
//   geram mais medalha nenhuma.
const Tournament = require("../models/Tournament");
const TournamentParticipant = require("../models/TournamentParticipant");
const { medalhasDoPersonagem } = require("./rankedSeasonService");

async function podioDoPersonagem(characterId) {
  const campeonatos = await TournamentParticipant.findAll({
    where: { character_id: characterId, final_placement: 1 },
    include: [
      {
        model: Tournament,
        as: "torneio",
        attributes: ["id", "name", "status"],
        where: { status: "Finalizado" },
        required: true,
      },
    ],
  });

  const { ouro, prata, bronze } = await medalhasDoPersonagem(characterId);

  return {
    ouro,
    prata,
    bronze,
    trofeus: campeonatos.length,
    titulos: campeonatos.map((p) => ({ torneioId: p.torneio.id, nome: p.torneio.name })),
  };
}

async function historicoDoPersonagem(characterId, { limite = 20 } = {}) {
  const participacoes = await TournamentParticipant.findAll({
    where: { character_id: characterId },
    include: [
      { model: Tournament, as: "torneio", attributes: ["id", "name", "status", "starts_at"] },
    ],
    order: [["id", "DESC"]],
    limit: limite,
  });

  return participacoes.map((p) => ({
    torneioId: p.tournament_id,
    nome: p.torneio?.name ?? "???",
    status: p.torneio?.status ?? null,
    colocacao: p.final_placement,
    eliminado: p.eliminated,
  }));
}

module.exports = { podioDoPersonagem, historicoDoPersonagem };
