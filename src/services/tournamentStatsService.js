// Pódio e troféus do perfil (PvP v2 §16/§17).
//
// TUDO é derivado por agregação de tournament_participants de torneios
// FINALIZADOS. Não existe contador manual em lugar nenhum: o cliente
// nunca envia medalha/troféu, e não há coluna independente que possa
// divergir. Por construção, Troféus === medalhas de ouro (1º lugar) —
// são a mesma contagem, exposta com dois nomes porque a UI pede assim.
const { Op } = require("sequelize");
const Tournament = require("../models/Tournament");
const TournamentParticipant = require("../models/TournamentParticipant");

async function podioDoPersonagem(characterId) {
  const participacoes = await TournamentParticipant.findAll({
    where: { character_id: characterId, final_placement: { [Op.in]: [1, 2, 3] } },
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

  const ouro = participacoes.filter((p) => p.final_placement === 1).length;
  const prata = participacoes.filter((p) => p.final_placement === 2).length;
  const bronze = participacoes.filter((p) => p.final_placement === 3).length;

  return {
    ouro,
    prata,
    bronze,
    // Nunca um contador próprio: é literalmente a contagem de 1º lugar,
    // então não tem como divergir do ouro.
    trofeus: ouro,
    titulos: participacoes
      .filter((p) => p.final_placement === 1)
      .map((p) => ({ torneioId: p.torneio.id, nome: p.torneio.name })),
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
