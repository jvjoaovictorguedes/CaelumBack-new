// Séries e jogos de torneio (PvP v2 §16).
//
// Cada série é MD3 (2 vitórias) ou MD5 (só a Final, 3 vitórias). Os
// jogos em si são duelos ao vivo normais entre dois humanos online
// (pvpLiveSocket.js) — este service não simula nada: recebe o resultado
// de um jogo, atualiza o placar, decide se a série acabou e avança o
// chaveamento.
//
// Nada aqui toca rating ranqueado, limite diário ou PvpStatus casual.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Tournament = require("../models/Tournament");
const TournamentParticipant = require("../models/TournamentParticipant");
const TournamentSeries = require("../models/TournamentSeries");
const TournamentMatch = require("../models/TournamentMatch");
const tournamentBracketService = require("./tournamentBracketService");
const tournamentService = require("./tournamentService");
const { VITORIAS_NECESSARIAS, READY_CHECK_SEGUNDOS } = require("../config/tournamentConfig");

function log(evento, dados) {
  console.log(`[torneio] ${evento}`, JSON.stringify(dados));
}

function vitoriasNecessarias(formato) {
  return VITORIAS_NECESSARIAS[formato] ?? VITORIAS_NECESSARIAS.MD3;
}

// Confirmação de ready check por um dos lados. Quando os dois
// confirmam, a série passa a EmAndamento.
async function confirmarPronto({ serieId, participantId }) {
  return sequelize.transaction(async (transaction) => {
    const serie = await TournamentSeries.findByPk(serieId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!serie) {
      throw new tournamentService.TournamentError("serie-nao-encontrada", "Série não encontrada.", 404);
    }
    if (serie.status !== "ReadyCheck") {
      throw new tournamentService.TournamentError(
        "ready-check-indisponivel",
        "Esta série não está em ready check.",
        409,
      );
    }
    if (serie.ready_check_expira_em && serie.ready_check_expira_em.getTime() <= Date.now()) {
      throw new tournamentService.TournamentError(
        "ready-check-expirado",
        "O prazo de confirmação desta série já expirou.",
        409,
      );
    }

    const campo =
      serie.participant_a_id === participantId
        ? "ready_a"
        : serie.participant_b_id === participantId
          ? "ready_b"
          : null;
    if (!campo) {
      throw new tournamentService.TournamentError(
        "nao-participa",
        "Você não participa desta série.",
        403,
      );
    }

    await serie.update({ [campo]: true }, { transaction });
    if (serie.ready_a && serie.ready_b) {
      await serie.update({ status: "EmAndamento" }, { transaction });
      log("serie:iniciada", { serie: serie.id, torneio: serie.tournament_id, formato: serie.format });
    }

    return serie;
  });
}

// §16 — prazo de ready check esgotado.
// Um lado confirmou → W.O. pro confirmante. Nenhum lado confirmou →
// NÃO escolhe vencedor: vira PendenteAdm pra DEV/ADM resolver.
async function resolverReadyCheckExpirado(serieId) {
  const serie = await TournamentSeries.findByPk(serieId);
  if (!serie || serie.status !== "ReadyCheck") return null;
  if (serie.ready_check_expira_em && serie.ready_check_expira_em.getTime() > Date.now()) return null;

  if (serie.ready_a && !serie.ready_b) {
    log("serie:wo", { serie: serie.id, vencedor: serie.participant_a_id, ausente: serie.participant_b_id });
    return finalizarSerie({ serieId, vencedorParticipantId: serie.participant_a_id, porWO: true });
  }
  if (serie.ready_b && !serie.ready_a) {
    log("serie:wo", { serie: serie.id, vencedor: serie.participant_b_id, ausente: serie.participant_a_id });
    return finalizarSerie({ serieId, vencedorParticipantId: serie.participant_b_id, porWO: true });
  }

  await serie.update({ status: "PendenteAdm" });
  log("serie:pendente-adm", {
    serie: serie.id,
    torneio: serie.tournament_id,
    motivo: "nenhum participante confirmou o ready check",
  });
  return serie;
}

// Registra o resultado de UM jogo da série. `duelId` é a sessão de
// duelo ao vivo que resolveu o jogo (rastreabilidade §16).
// Idempotente por (serie, game_number): reenviar o mesmo jogo não soma
// o placar duas vezes.
async function registrarResultadoDeJogo({
  serieId,
  vencedorParticipantId,
  duelId = null,
  motivo = "Combate",
}) {
  return sequelize.transaction(async (transaction) => {
    const serie = await TournamentSeries.findByPk(serieId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!serie) {
      throw new tournamentService.TournamentError("serie-nao-encontrada", "Série não encontrada.", 404);
    }
    if (serie.status === "Finalizada" || serie.status === "WO") {
      // §12/§16 — guarda de idempotência: série já resolvida é no-op.
      return { serie, ignorado: true };
    }
    if (![serie.participant_a_id, serie.participant_b_id].includes(vencedorParticipantId)) {
      throw new tournamentService.TournamentError(
        "vencedor-invalido",
        "O vencedor informado não participa desta série.",
        400,
      );
    }

    const jogosAnteriores = await TournamentMatch.count({
      where: { series_id: serieId },
      transaction,
    });

    await TournamentMatch.create(
      {
        series_id: serieId,
        game_number: jogosAnteriores + 1,
        duel_id: duelId,
        winner_participant_id: vencedorParticipantId,
        motivo_encerramento: motivo,
        encerrado_em: new Date(),
      },
      { transaction },
    );

    const ehA = vencedorParticipantId === serie.participant_a_id;
    const scoreA = serie.score_a + (ehA ? 1 : 0);
    const scoreB = serie.score_b + (ehA ? 0 : 1);
    await serie.update({ score_a: scoreA, score_b: scoreB }, { transaction });

    const alvo = vitoriasNecessarias(serie.format);
    log("serie:jogo", {
      serie: serie.id,
      jogo: jogosAnteriores + 1,
      vencedor: vencedorParticipantId,
      placar: `${scoreA}-${scoreB}`,
      alvo,
    });

    if (scoreA >= alvo || scoreB >= alvo) {
      const vencedorSerie = scoreA >= alvo ? serie.participant_a_id : serie.participant_b_id;
      await aplicarFimDeSerie({ serie, vencedorParticipantId: vencedorSerie, porWO: false, transaction });
      return { serie, serieFinalizada: true, vencedorSerie };
    }

    return { serie, serieFinalizada: false };
  });
}

async function finalizarSerie({ serieId, vencedorParticipantId, porWO = false }) {
  return sequelize.transaction(async (transaction) => {
    const serie = await TournamentSeries.findByPk(serieId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!serie) {
      throw new tournamentService.TournamentError("serie-nao-encontrada", "Série não encontrada.", 404);
    }
    if (["Finalizada", "WO"].includes(serie.status)) return serie;
    await aplicarFimDeSerie({ serie, vencedorParticipantId, porWO, transaction });
    return serie;
  });
}

// Avança o chaveamento: coloca o vencedor na série seguinte, manda
// perdedor de semifinal pro 3º lugar, marca eliminados, abre o ready
// check da próxima série quando ela fica completa e fecha o torneio
// quando a Final e o 3º lugar terminam.
async function aplicarFimDeSerie({ serie, vencedorParticipantId, porWO, transaction }) {
  const perdedorId =
    vencedorParticipantId === serie.participant_a_id ? serie.participant_b_id : serie.participant_a_id;

  await serie.update(
    { winner_participant_id: vencedorParticipantId, status: porWO ? "WO" : "Finalizada" },
    { transaction },
  );

  // Série encerrada libera o loadout dos dois lados (§16 — a trava só
  // vale enquanto a série está em curso).
  for (const participanteId of [serie.participant_a_id, serie.participant_b_id]) {
    if (participanteId) {
      await TournamentParticipant.update(
        { loadout_travado: null },
        { where: { id: participanteId }, transaction },
      );
    }
  }

  const destinoVencedor = tournamentBracketService.destinoDoVencedor(serie.round, serie.posicao);
  const destinoPerdedor = tournamentBracketService.destinoDoPerdedor(serie.round, serie.posicao);

  if (destinoVencedor) {
    await colocarEmSerie({
      tournamentId: serie.tournament_id,
      destino: destinoVencedor,
      participantId: vencedorParticipantId,
      transaction,
    });
  }

  if (destinoPerdedor && perdedorId) {
    await colocarEmSerie({
      tournamentId: serie.tournament_id,
      destino: destinoPerdedor,
      participantId: perdedorId,
      transaction,
    });
  } else if (perdedorId && serie.round !== "Final" && serie.round !== "TerceiroLugar") {
    await TournamentParticipant.update(
      { eliminated: true },
      { where: { id: perdedorId }, transaction },
    );
  }

  // Colocações finais.
  if (serie.round === "Final") {
    await TournamentParticipant.update(
      { final_placement: 1 },
      { where: { id: vencedorParticipantId }, transaction },
    );
    if (perdedorId) {
      await TournamentParticipant.update(
        { final_placement: 2, eliminated: true },
        { where: { id: perdedorId }, transaction },
      );
    }
  }
  if (serie.round === "TerceiroLugar") {
    await TournamentParticipant.update(
      { final_placement: 3 },
      { where: { id: vencedorParticipantId }, transaction },
    );
    if (perdedorId) {
      await TournamentParticipant.update(
        { final_placement: 4, eliminated: true },
        { where: { id: perdedorId }, transaction },
      );
    }
  }

  log("serie:finalizada", {
    serie: serie.id,
    torneio: serie.tournament_id,
    round: serie.round,
    vencedor: vencedorParticipantId,
    porWO,
  });

  await fecharTorneioSeAcabou(serie.tournament_id, transaction);
}

async function colocarEmSerie({ tournamentId, destino, participantId, transaction }) {
  const alvo = await TournamentSeries.findOne({
    where: { tournament_id: tournamentId, round: destino.round, posicao: destino.posicao },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!alvo) return null;

  const campo = destino.lado === "a" ? "participant_a_id" : "participant_b_id";
  await alvo.update({ [campo]: participantId }, { transaction });

  // Série completa → abre o ready check e congela o loadout dos dois.
  if (alvo.participant_a_id && alvo.participant_b_id && alvo.status === "Aguardando") {
    await alvo.update(
      {
        status: "ReadyCheck",
        ready_check_expira_em: new Date(Date.now() + READY_CHECK_SEGUNDOS * 1000),
      },
      { transaction },
    );
    for (const participanteId of [alvo.participant_a_id, alvo.participant_b_id]) {
      const participante = await TournamentParticipant.findByPk(participanteId, { transaction });
      if (participante) {
        await participante.update(
          { loadout_travado: await tournamentService.snapshotLoadout(participante.character_id, transaction) },
          { transaction },
        );
      }
    }
    log("serie:ready-check", {
      serie: alvo.id,
      torneio: tournamentId,
      round: alvo.round,
      prazoSegundos: READY_CHECK_SEGUNDOS,
    });
  }

  return alvo;
}

async function fecharTorneioSeAcabou(tournamentId, transaction) {
  const pendentes = await TournamentSeries.count({
    where: {
      tournament_id: tournamentId,
      status: { [Op.notIn]: ["Finalizada", "WO"] },
    },
    transaction,
  });
  if (pendentes > 0) return false;

  await Tournament.update(
    { status: "Finalizado" },
    { where: { id: tournamentId, status: "EmAndamento" }, transaction },
  );
  log("torneio:finalizado", { torneio: tournamentId });
  return true;
}

// Série ativa de um personagem (usada pela exclusão mútua §16 e pelo
// socket de torneio).
async function serieAtivaDoPersonagem(characterId) {
  const participacoes = await TournamentParticipant.findAll({
    where: { character_id: characterId },
    attributes: ["id", "tournament_id"],
  });
  if (participacoes.length === 0) return null;
  const ids = participacoes.map((p) => p.id);

  return TournamentSeries.findOne({
    where: {
      status: { [Op.in]: ["ReadyCheck", "EmAndamento"] },
      [Op.or]: [{ participant_a_id: { [Op.in]: ids } }, { participant_b_id: { [Op.in]: ids } }],
    },
  });
}

module.exports = {
  vitoriasNecessarias,
  confirmarPronto,
  resolverReadyCheckExpirado,
  registrarResultadoDeJogo,
  finalizarSerie,
  serieAtivaDoPersonagem,
};
