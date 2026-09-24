// src/socket/tournamentSocket.js
//
// Torneios (PvP v2 §16) — camada ao vivo. Como no ranqueado, NÃO
// duplica motor de combate: um jogo de série é um duelo ao vivo normal
// (pvpLiveSocket.js) entre dois humanos online, inserido nos MESMOS
// mapas `duelos`/`duelPorPersonagem`. A diferença é só o que acontece
// no fim: em vez de creditar recompensa casual, o resultado vira um
// TournamentMatch e faz o placar da série andar.
//
// Consumíveis: HABILITADOS, igual ao duelo casual. A desativação é
// exclusiva do ranqueado (§10) — este duelo não seta `duelo.ranked`,
// então o handler de "pvp:acao" continua aceitando item normalmente.
const TournamentParticipant = require("../models/TournamentParticipant");
const TournamentSeries = require("../models/TournamentSeries");
const tournamentMatchService = require("../services/tournamentMatchService");
const pvpLiveSocket = require("./pvpLiveSocket");
const { READY_CHECK_SEGUNDOS } = require("../config/tournamentConfig");

const NOME_ARENA_TORNEIO = "Arena de Torneios de Caelum";
const INTERVALO_VARREDURA_READY_CHECK_MS = 15000;

function log(evento, dados) {
  console.log(`[torneio] ${evento}`, JSON.stringify(dados));
}

function salaDaSerie(serieId) {
  return `torneio:serie:${serieId}`;
}

async function participantesDaSerie(serie) {
  const [a, b] = await Promise.all([
    serie.participant_a_id ? TournamentParticipant.findByPk(serie.participant_a_id) : null,
    serie.participant_b_id ? TournamentParticipant.findByPk(serie.participant_b_id) : null,
  ]);
  return { a, b };
}

// Inicia UM jogo da série como duelo ao vivo. Exige os dois online.
async function iniciarJogoDaSerie(io, serieId) {
  const serie = await TournamentSeries.findByPk(serieId);
  if (!serie || serie.status !== "EmAndamento") return null;

  const { a, b } = await participantesDaSerie(serie);
  if (!a || !b) return null;

  const chaveA = pvpLiveSocket.chaveOnline(a.character_id);
  const chaveB = pvpLiveSocket.chaveOnline(b.character_id);

  if (!pvpLiveSocket.online.has(chaveA) || !pvpLiveSocket.online.has(chaveB)) {
    io.to(salaDaSerie(serieId)).emit("torneio:erro", {
      mensagem: "Os dois participantes precisam estar online para o jogo começar.",
    });
    return null;
  }
  if (pvpLiveSocket.duelPorPersonagem.has(chaveA) || pvpLiveSocket.duelPorPersonagem.has(chaveB)) {
    io.to(salaDaSerie(serieId)).emit("torneio:erro", {
      mensagem: "Um dos participantes já está em outro duelo.",
    });
    return null;
  }

  const [lutadorA, lutadorB] = await Promise.all([
    pvpLiveSocket.carregarLutador(a.character_id),
    pvpLiveSocket.carregarLutador(b.character_id),
  ]);
  if (!lutadorA || !lutadorB) return null;

  const duelId = pvpLiveSocket.alocarDuelId();
  const sala = `torneio:${duelId}`;
  const primeiro = lutadorA.estado.velocidade >= lutadorB.estado.velocidade ? "A" : "B";

  const duelo = {
    id: duelId,
    sala,
    a: lutadorA,
    b: lutadorB,
    turnoDe: primeiro,
    acoes: 0,
    danoTotalA: 0,
    danoTotalB: 0,
    timer: null,
    torneio: true,
    serieId,
    participantAId: a.id,
    participantBId: b.id,
    finalizar: finalizarJogoDeTorneio,
  };

  pvpLiveSocket.duelos.set(duelId, duelo);
  pvpLiveSocket.duelPorPersonagem.set(chaveA, duelId);
  pvpLiveSocket.duelPorPersonagem.set(chaveB, duelId);

  const socketA = io.sockets.sockets.get(pvpLiveSocket.online.get(chaveA));
  const socketB = io.sockets.sockets.get(pvpLiveSocket.online.get(chaveB));
  socketA?.join(sala);
  socketB?.join(sala);

  io.to(sala).emit("pvp:duelo-iniciado", {
    duelId,
    arena: NOME_ARENA_TORNEIO,
    torneio: { serieId, round: serie.round, formato: serie.format },
    a: { id: lutadorA.id, nome: lutadorA.nome, genero: lutadorA.genero, classe: lutadorA.classe, chave: "A" },
    b: { id: lutadorB.id, nome: lutadorB.nome, genero: lutadorB.genero, classe: lutadorB.classe, chave: "B" },
    vidaMaxA: lutadorA.vidaMax,
    vidaMaxB: lutadorB.vidaMax,
    manaMaxA: lutadorA.manaMax,
    manaMaxB: lutadorB.manaMax,
    vidaA: lutadorA.estado.vida_atual,
    vidaB: lutadorB.estado.vida_atual,
    manaA: lutadorA.estado.mana_atual,
    manaB: lutadorB.estado.mana_atual,
    poderesA: pvpLiveSocket.poderesPublicos(lutadorA.poderes),
    poderesB: pvpLiveSocket.poderesPublicos(lutadorB.poderes),
    // Consumíveis liberados — mesma regra do casual (§16).
    consumiveisA: lutadorA.consumiveis,
    consumiveisB: lutadorB.consumiveis,
    turnoDe: primeiro,
    prazoSegundos: pvpLiveSocket.PRAZO_TURNO_MS / 1000,
  });

  pvpLiveSocket.iniciarTimerDeTurno(io, duelId);
  log("jogo:iniciado", { serie: serieId, duelId, a: a.character_id, b: b.character_id });
  return duelId;
}

// Fim de um jogo de torneio. NUNCA chama aplicarResultadoDuelo (isso
// creditaria ouro/XP e mexeria em PvpStatus casual) e nunca toca rating
// ranqueado: torneio é uma experiência isolada (§1/§16).
async function finalizarJogoDeTorneio(io, duelId, vencedorChave, motivo = "combate") {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  clearTimeout(duelo.timer);
  pvpLiveSocket.duelos.delete(duelId);
  pvpLiveSocket.duelPorPersonagem.delete(String(duelo.a.id));
  pvpLiveSocket.duelPorPersonagem.delete(String(duelo.b.id));

  const vencedorParticipantId =
    vencedorChave === "A" ? duelo.participantAId : duelo.participantBId;

  let resultado = null;
  try {
    resultado = await tournamentMatchService.registrarResultadoDeJogo({
      serieId: duelo.serieId,
      vencedorParticipantId,
      duelId,
      motivo: motivo === "desistencia" ? "Desistencia" : "Combate",
    });
  } catch (error) {
    console.error("[torneio] Falha ao registrar resultado de jogo:", error);
    io.to(duelo.sala).emit("torneio:erro", { mensagem: "Erro ao registrar o resultado do jogo." });
    return;
  }

  const serie = await TournamentSeries.findByPk(duelo.serieId);

  io.to(duelo.sala).emit("pvp:duelo-fim", {
    duelId,
    vencedorChave,
    vencedor: vencedorChave === "A" ? { id: duelo.a.id, nome: duelo.a.nome } : { id: duelo.b.id, nome: duelo.b.nome },
    perdedor: vencedorChave === "A" ? { id: duelo.b.id, nome: duelo.b.nome } : { id: duelo.a.id, nome: duelo.a.nome },
    motivo,
    torneio: true,
  });

  io.to(duelo.sala).emit("torneio:serie:placar", {
    serieId: duelo.serieId,
    placar: { a: serie?.score_a ?? 0, b: serie?.score_b ?? 0 },
    formato: serie?.format,
    status: serie?.status,
    vencedorSerie: serie?.winner_participant_id ?? null,
  });

  for (const socketId of io.sockets.adapter.rooms.get(duelo.sala) || []) {
    io.sockets.sockets.get(socketId)?.leave(duelo.sala);
  }

  // Série ainda viva → próximo jogo (os dois já estão online aqui).
  if (!resultado?.serieFinalizada && serie?.status === "EmAndamento") {
    setTimeout(() => {
      iniciarJogoDaSerie(io, duelo.serieId).catch((error) =>
        console.error("[torneio] Falha ao iniciar próximo jogo da série:", error),
      );
    }, 3000);
  }
}

// Varredura periódica de ready checks vencidos (§16). Persistido no
// banco em vez de timer em memória justamente pra sobreviver a restart.
function iniciarVarreduraReadyCheck(io) {
  const timer = setInterval(async () => {
    try {
      const { Op } = require("sequelize");
      const vencidas = await TournamentSeries.findAll({
        where: { status: "ReadyCheck", ready_check_expira_em: { [Op.lte]: new Date() } },
        limit: 50,
      });
      for (const serie of vencidas) {
        const resolvida = await tournamentMatchService.resolverReadyCheckExpirado(serie.id);
        if (resolvida) {
          io.to(salaDaSerie(serie.id)).emit("torneio:serie:atualizada", {
            serieId: serie.id,
            status: resolvida.status,
            vencedorSerie: resolvida.winner_participant_id ?? null,
          });
        }
      }
    } catch (error) {
      console.error("[torneio] Falha na varredura de ready check:", error);
    }
  }, INTERVALO_VARREDURA_READY_CHECK_MS);
  if (timer.unref) timer.unref();
  return timer;
}

// Varredura periódica de séries "EmAndamento" sem nenhum duelo ativo
// (bug reportado: jogador não conseguia entrar na ranqueada porque o
// sistema achava que ele tinha um torneio em andamento, mesmo sem
// nenhuma partida de verdade rolando). iniciarJogoDaSerie só roda
// automaticamente logo que a série vira EmAndamento e 3s depois de
// cada jogo terminar — se um dos dois estava offline bem nessa hora, a
// tentativa falhava e nada mais tentava de novo, travando a série pra
// sempre. Esta varredura tenta de novo (self-healing pro caso comum de
// reconexão) e, se continuar travada além do prazo, força uma
// resolução via tournamentMatchService.resolverSerieTravada (W.O. ou
// PendenteAdm).
const INTERVALO_VARREDURA_SERIES_TRAVADAS_MS = 30000;

function iniciarVarreduraSeriesTravadas(io) {
  const timer = setInterval(async () => {
    try {
      const emAndamento = await TournamentSeries.findAll({
        where: { status: "EmAndamento" },
        limit: 50,
      });
      const duelosDeTorneioAtivos = new Set(
        Array.from(pvpLiveSocket.duelos.values())
          .filter((d) => d.torneio)
          .map((d) => d.serieId),
      );
      for (const serie of emAndamento) {
        if (duelosDeTorneioAtivos.has(serie.id)) continue;
        const iniciado = await iniciarJogoDaSerie(io, serie.id);
        if (iniciado) continue;
        const resolvida = await tournamentMatchService.resolverSerieTravada(serie.id);
        if (resolvida) {
          io.to(salaDaSerie(serie.id)).emit("torneio:serie:atualizada", {
            serieId: serie.id,
            status: resolvida.status,
            vencedorSerie: resolvida.winner_participant_id ?? null,
          });
        }
      }
    } catch (error) {
      console.error("[torneio] Falha na varredura de séries travadas:", error);
    }
  }, INTERVALO_VARREDURA_SERIES_TRAVADAS_MS);
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = function registerTournamentHandlers(io) {
  iniciarVarreduraReadyCheck(io);
  iniciarVarreduraSeriesTravadas(io);

  io.on("connection", (socket) => {
    // Reaproveita socket.characterId de pvpLiveSocket."identificar".

    socket.on("torneio:entrar-sala", async ({ serieId } = {}) => {
      if (!socket.characterId || !serieId) return;
      const serie = await TournamentSeries.findByPk(serieId);
      if (!serie) return socket.emit("torneio:erro", { mensagem: "Série não encontrada." });
      const { a, b } = await participantesDaSerie(serie);
      const ids = [a?.character_id, b?.character_id].map(String);
      if (!ids.includes(socket.characterId)) {
        return socket.emit("torneio:erro", { mensagem: "Você não participa desta série." });
      }
      socket.join(salaDaSerie(serieId));
      socket.emit("torneio:serie:atualizada", {
        serieId,
        status: serie.status,
        placar: { a: serie.score_a, b: serie.score_b },
        formato: serie.format,
        prazoReadyCheckSegundos: READY_CHECK_SEGUNDOS,
        readyA: serie.ready_a,
        readyB: serie.ready_b,
      });
    });

    // §16 — ready check. O participante é resolvido pelo characterId da
    // sessão do socket, nunca por id enviado no payload.
    socket.on("torneio:pronto", async ({ serieId } = {}) => {
      if (!socket.characterId || !serieId) return;
      try {
        const serie = await TournamentSeries.findByPk(serieId);
        if (!serie) return socket.emit("torneio:erro", { mensagem: "Série não encontrada." });

        const { a, b } = await participantesDaSerie(serie);
        const meu = [a, b].find((p) => p && String(p.character_id) === socket.characterId);
        if (!meu) return socket.emit("torneio:erro", { mensagem: "Você não participa desta série." });

        // Exclusão mútua (§16): não dá pra confirmar torneio estando em
        // outro duelo (casual ou ranqueado) agora.
        if (pvpLiveSocket.duelPorPersonagem.has(socket.characterId)) {
          return socket.emit("torneio:erro", {
            mensagem: "Termine o duelo em andamento antes de confirmar a série do torneio.",
          });
        }

        const atualizada = await tournamentMatchService.confirmarPronto({
          serieId,
          participantId: meu.id,
        });

        io.to(salaDaSerie(serieId)).emit("torneio:serie:atualizada", {
          serieId,
          status: atualizada.status,
          readyA: atualizada.ready_a,
          readyB: atualizada.ready_b,
        });

        if (atualizada.status === "EmAndamento") {
          await iniciarJogoDaSerie(io, serieId);
        }
      } catch (error) {
        socket.emit("torneio:erro", {
          mensagem: error.codigo ? error.message : "Não foi possível confirmar agora.",
        });
      }
    });
  });
};

module.exports.iniciarJogoDaSerie = iniciarJogoDaSerie;
module.exports.finalizarJogoDeTorneio = finalizarJogoDeTorneio;
module.exports.salaDaSerie = salaDaSerie;
