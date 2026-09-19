// src/socket/rankedLiveSocket.js
//
// Arena Ranqueada (PvP Competitivo v1) — camada de integração com o
// duelo ao vivo (§3/§18.4 da spec). NÃO duplica motor de turno,
// carregamento de lutador nem presença: tudo isso vem de
// pvpLiveSocket.js (exports adicionados especificamente pra isso). O
// que este módulo adiciona é específico do ranqueado: pareamento via
// fila (nunca escolha direta de oponente), rating Elo no fim da
// partida, e janela de reconexão de 30s (§9) — o duelo casual continua
// desistindo na hora.
//
// Ações de turno usam o MESMO evento "pvp:acao" já registrado por
// pvpLiveSocket.js — aquele handler resolve o duelo genericamente via
// duelPorPersonagem/duelos, então um duelo ranked (criado aqui, mas
// inserido nos mesmos Maps) já funciona com ele sem nenhuma mudança.
const RankedMatch = require("../models/RankedMatch");
const rankedMatchmakingService = require("../services/rankedMatchmakingService");
const rankedRatingService = require("../services/rankedRatingService");
const rankedAntifarmService = require("../services/rankedAntifarmService");
const rankedSeasonService = require("../services/rankedSeasonService");
const { JANELA_RECONEXAO_SEGUNDOS } = require("../config/rankedConfig");
const pvpLiveSocket = require("./pvpLiveSocket");

const NOME_ARENA_RANKED = "Arena Ranqueada de Caelum";

// Predicado de anti-farm (§10) injetado no matchmaking — mantém o
// service de fila 100% desacoplado de regra de negócio ranked.
rankedMatchmakingService.podeParear = rankedAntifarmService.podeParear;

function montarPayloadInicio(duelo, ehResync = false) {
  return {
    duelId: duelo.id,
    arena: NOME_ARENA_RANKED,
    ranked: true,
    temporada: { id: duelo.seasonId },
    a: { id: duelo.a.id, nome: duelo.a.nome, genero: duelo.a.genero, classe: duelo.a.classe, chave: "A" },
    b: { id: duelo.b.id, nome: duelo.b.nome, genero: duelo.b.genero, classe: duelo.b.classe, chave: "B" },
    ratingA: duelo.ratingAntes.A,
    ratingB: duelo.ratingAntes.B,
    ligaA: rankedRatingService.ligaParaRating(duelo.ratingAntes.A),
    ligaB: rankedRatingService.ligaParaRating(duelo.ratingAntes.B),
    vidaMaxA: duelo.a.vidaMax,
    vidaMaxB: duelo.b.vidaMax,
    manaMaxA: duelo.a.manaMax,
    manaMaxB: duelo.b.manaMax,
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
    poderesA: pvpLiveSocket.poderesPublicos(duelo.a.poderes),
    poderesB: pvpLiveSocket.poderesPublicos(duelo.b.poderes),
    consumiveisA: duelo.a.consumiveis,
    consumiveisB: duelo.b.consumiveis,
    turnoDe: duelo.turnoDe,
    prazoSegundos: pvpLiveSocket.PRAZO_TURNO_MS / 1000,
    resync: ehResync,
  };
}

function limparGraceTimers(duelo) {
  if (!duelo.desconexoes) return;
  for (const timer of Object.values(duelo.desconexoes)) clearTimeout(timer);
  duelo.desconexoes = {};
}

// §9 — desconexão em partida ranqueada não pode anular o resultado
// indefinidamente: concede 30s pra reconectar, e se não voltar conta
// derrota por abandono (não uma anulação sem vencedor).
function aoDesconectarRanked(io, duelId, characterId) {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  const chave = duelo.a.id === Number(characterId) ? "A" : "B";
  duelo.desconexoes = duelo.desconexoes || {};
  if (duelo.desconexoes[chave]) return; // já tem grace period rodando pra esse lado

  io.to(duelo.sala).emit("ranked:oponente-desconectado", {
    characterId: Number(characterId),
    prazoSegundos: JANELA_RECONEXAO_SEGUNDOS,
  });

  duelo.desconexoes[chave] = setTimeout(() => {
    const vencedorChave = chave === "A" ? "B" : "A";
    finalizarDueloRanked(io, duelId, vencedorChave, "abandono");
  }, JANELA_RECONEXAO_SEGUNDOS * 1000);
}

function aoReconectarRanked(io, socket, duelId) {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  const characterId = socket.characterId;
  const chave = duelo.a.id === Number(characterId) ? "A" : "B";
  if (duelo.desconexoes?.[chave]) {
    clearTimeout(duelo.desconexoes[chave]);
    delete duelo.desconexoes[chave];
  }

  socket.join(duelo.sala);
  io.to(duelo.sala).emit("ranked:oponente-reconectado", { characterId: Number(characterId) });
  socket.emit("ranked:match:start", montarPayloadInicio(duelo, true));
}

// Resultado oficial de uma partida ranqueada (§16 — observabilidade
// completa: rating antes/depois dos dois, motivo, timestamps).
// `motivo`: "combate" | "abandono" | "falha-servidor". Falha comprovada
// do servidor NUNCA altera rating (§9) — nem quando passada
// explicitamente, nem quando o próprio cálculo de rating lança uma
// exceção (nesse caso vira falha-servidor automaticamente em vez de
// deixar a partida travada sem resultado nenhum).
async function finalizarDueloRanked(io, duelId, vencedorChave, motivo = "combate") {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  clearTimeout(duelo.timer);
  limparGraceTimers(duelo);
  pvpLiveSocket.duelos.delete(duelId);
  pvpLiveSocket.duelPorPersonagem.delete(String(duelo.a.id));
  pvpLiveSocket.duelPorPersonagem.delete(String(duelo.b.id));

  const vencedorInfo = vencedorChave === "A" ? duelo.a : duelo.b;
  const perdedorInfo = vencedorChave === "A" ? duelo.b : duelo.a;

  let resultado = null;
  let motivoFinal = motivo === "abandono" ? "Abandono" : "Vitoria";

  if (motivo === "falha-servidor") {
    motivoFinal = "FalhaServidor";
  } else {
    try {
      resultado = await rankedRatingService.aplicarResultadoRanked({
        idVencedor: vencedorInfo.id,
        idPerdedor: perdedorInfo.id,
        seasonId: duelo.seasonId,
      });
      rankedAntifarmService.registrarResultado(vencedorInfo.id, perdedorInfo.id);
    } catch (error) {
      console.error("Falha ao aplicar resultado ranked — encerrando sem alterar rating:", error);
      motivoFinal = "FalhaServidor";
      resultado = null;
    }
  }

  try {
    await RankedMatch.update(
      {
        id_vencedor: resultado ? vencedorInfo.id : null,
        rating_jogador1_depois: resultado
          ? duelo.a.id === vencedorInfo.id
            ? resultado.ratingVencedorDepois
            : resultado.ratingPerdedorDepois
          : null,
        rating_jogador2_depois: resultado
          ? duelo.b.id === vencedorInfo.id
            ? resultado.ratingVencedorDepois
            : resultado.ratingPerdedorDepois
          : null,
        motivo_encerramento: motivoFinal,
        encerrada_em: new Date(),
      },
      { where: { id: duelo.rankedMatchId } },
    );
  } catch (error) {
    console.error("Falha ao persistir encerramento de RankedMatch:", error);
  }

  // "pvp:duelo-fim" reaproveita a MESMA UI de fim de duelo do casual no
  // frontend (LiveDuelArena) — sem recompensa/nível (ranked não mexe em
  // Gold/XP na v1, só rating), e "ranked:rating:update" complementa com
  // o delta de Elo (§13 — nenhum client calcula ou envia esse valor).
  io.to(duelo.sala).emit("pvp:duelo-fim", {
    duelId,
    vencedorChave: resultado ? vencedorChave : null,
    vencedor: resultado ? { id: vencedorInfo.id, nome: vencedorInfo.nome } : null,
    perdedor: resultado ? { id: perdedorInfo.id, nome: perdedorInfo.nome } : null,
    motivo: motivoFinal,
    ranked: true,
  });

  if (resultado) {
    const ratingADepois =
      duelo.a.id === vencedorInfo.id ? resultado.ratingVencedorDepois : resultado.ratingPerdedorDepois;
    const ratingBDepois =
      duelo.b.id === vencedorInfo.id ? resultado.ratingVencedorDepois : resultado.ratingPerdedorDepois;

    io.to(duelo.sala).emit("ranked:rating:update", {
      duelId,
      jogadorA: {
        id: duelo.a.id,
        ratingAntes: duelo.ratingAntes.A,
        ratingDepois: ratingADepois,
        liga: rankedRatingService.ligaParaRating(ratingADepois),
      },
      jogadorB: {
        id: duelo.b.id,
        ratingAntes: duelo.ratingAntes.B,
        ratingDepois: ratingBDepois,
        liga: rankedRatingService.ligaParaRating(ratingBDepois),
      },
    });
  }

  for (const socketId of io.sockets.adapter.rooms.get(duelo.sala) || []) {
    io.sockets.sockets.get(socketId)?.leave(duelo.sala);
  }
}

// Chamado pelo rankedMatchmakingService quando encontra um par
// compatível. idJogador1/idJogador2 já foram removidos da fila pelo
// service nesse momento.
async function criarPartidaRanked(io, idJogador1, idJogador2) {
  const chave1 = pvpLiveSocket.chaveOnline(idJogador1);
  const chave2 = pvpLiveSocket.chaveOnline(idJogador2);

  // Revalida presença e "não pareado ainda" no exato instante do match —
  // a fila só sabe de rating/tempo, não de desconexões/duelos que
  // começaram depois de entrar nela.
  const aindaValido =
    pvpLiveSocket.online.has(chave1) &&
    pvpLiveSocket.online.has(chave2) &&
    !pvpLiveSocket.duelPorPersonagem.has(chave1) &&
    !pvpLiveSocket.duelPorPersonagem.has(chave2);

  if (!aindaValido) {
    // Devolve pra fila só quem ainda está online e livre — o outro
    // simplesmente não é readicionado (ele já saiu/está ocupado, então
    // "entrar de novo" seria voltar a um estado inconsistente).
    for (const [id, chave] of [
      [idJogador1, chave1],
      [idJogador2, chave2],
    ]) {
      if (pvpLiveSocket.online.has(chave) && !pvpLiveSocket.duelPorPersonagem.has(chave)) {
        const participacao = await rankedRatingService.obterOuCriarParticipacao(
          id,
          (await rankedSeasonService.obterOuIniciarTemporadaAtiva()).id,
        );
        rankedMatchmakingService.entrar(id, participacao.rating);
      }
    }
    return;
  }

  try {
    const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
    const [participacao1, participacao2] = await Promise.all([
      rankedRatingService.obterOuCriarParticipacao(idJogador1, temporada.id),
      rankedRatingService.obterOuCriarParticipacao(idJogador2, temporada.id),
    ]);

    const [lutadorA, lutadorB] = await Promise.all([
      pvpLiveSocket.carregarLutador(idJogador1),
      pvpLiveSocket.carregarLutador(idJogador2),
    ]);
    if (!lutadorA || !lutadorB) throw new Error("Personagem não encontrado ao montar partida ranqueada.");

    const partida = await RankedMatch.create({
      season_id: temporada.id,
      id_jogador1: idJogador1,
      id_jogador2: idJogador2,
      rating_jogador1_antes: participacao1.rating,
      rating_jogador2_antes: participacao2.rating,
      iniciada_em: new Date(),
    });

    const duelId = pvpLiveSocket.alocarDuelId();
    const sala = `ranked:${duelId}`;
    const primeiro = lutadorA.estado.velocidade >= lutadorB.estado.velocidade ? "A" : "B";

    const duelo = {
      id: duelId,
      sala,
      a: lutadorA,
      b: lutadorB,
      turnoDe: primeiro,
      acoes: 0,
      timer: null,
      ranked: true,
      seasonId: temporada.id,
      rankedMatchId: partida.id,
      ratingAntes: { A: participacao1.rating, B: participacao2.rating },
      finalizar: finalizarDueloRanked,
      aoDesconectar: aoDesconectarRanked,
      aoReconectar: aoReconectarRanked,
    };

    pvpLiveSocket.duelos.set(duelId, duelo);
    pvpLiveSocket.duelPorPersonagem.set(chave1, duelId);
    pvpLiveSocket.duelPorPersonagem.set(chave2, duelId);

    const socketA = io.sockets.sockets.get(pvpLiveSocket.online.get(chave1));
    const socketB = io.sockets.sockets.get(pvpLiveSocket.online.get(chave2));
    socketA?.join(sala);
    socketB?.join(sala);

    io.to(sala).emit("ranked:match:found", {
      duelId,
      a: { id: lutadorA.id, nome: lutadorA.nome, rating: participacao1.rating },
      b: { id: lutadorB.id, nome: lutadorB.nome, rating: participacao2.rating },
    });
    io.to(sala).emit("ranked:match:start", montarPayloadInicio(duelo));

    pvpLiveSocket.iniciarTimerDeTurno(io, duelId);
  } catch (error) {
    console.error("Erro ao criar partida ranqueada:", error);
    io.to(pvpLiveSocket.online.get(chave1)).emit("pvp:erro", {
      mensagem: "Não foi possível iniciar a partida ranqueada.",
    });
    io.to(pvpLiveSocket.online.get(chave2)).emit("pvp:erro", {
      mensagem: "Não foi possível iniciar a partida ranqueada.",
    });
  }
}

module.exports = function registerRankedLiveHandlers(io) {
  rankedMatchmakingService.on("match", ({ jogador1, jogador2 }) => {
    criarPartidaRanked(io, jogador1, jogador2).catch((error) => {
      console.error("Erro não tratado ao processar match ranked:", error);
    });
  });

  io.on("connection", (socket) => {
    // Sem "identificar" próprio aqui de propósito — reaproveita
    // socket.characterId já setado pelo "identificar" de
    // pvpLiveSocket.js na MESMA conexão (a Arena Ranqueada vive na
    // mesma página/socket do Duelo, diferente do chat de guilda, que
    // usa uma conexão separada e por isso precisou de evento próprio).
    socket.on("disconnect", () => {
      if (socket.characterId && rankedMatchmakingService.estaNaFila(socket.characterId)) {
        rankedMatchmakingService.sair(socket.characterId);
      }
    });
  });
};

module.exports.finalizarDueloRanked = finalizarDueloRanked;
module.exports.criarPartidaRanked = criarPartidaRanked;
