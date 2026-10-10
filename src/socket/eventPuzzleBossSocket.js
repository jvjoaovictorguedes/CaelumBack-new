// src/socket/eventPuzzleBossSocket.js
//
// Evento "O Coração da Máquina Celestial" — Fase 13: luta contra o
// Custódio do Meridiano. Clone estrutural de templeBossSocket.js —
// mesmo princípio solo (cada ação do jogador resolve o TURNO INTEIRO —
// jogador + contra-ataque do Custódio — numa única chamada, dentro de
// UMA transaction: lock do attempt + persistência do runtime_state +
// grants de vitória, tudo atômico). Estado em memória só serve pro
// rate-limit do gesto — a autoridade real é sempre
// EventPuzzleBossAttempt.runtime_state no banco, nunca um Map que se
// perde num restart.
//
// Diferença do Templo: "entrar" recebe eventEditionId (Puzzle não tem
// um evento-singleton "aberto agora" — cada Edition é uma luta
// potencialmente diferente) e a sala do socket é escopada por edição
// (nunca cross-edição).
const SOCKET_EVENTS = require("../contracts/socketEvents");
const { poderesPublicos } = require("../contracts/pvpPayloads");
const { sequelize } = require("../config/database");
const EventPuzzleBossAttempt = require("../models/eventPuzzleBossModels").EventPuzzleBossAttempt;
const eventPuzzleBossAttemptService = require("../services/eventPuzzleBossAttemptService");
const eventPuzzleBossCombatService = require("../services/eventPuzzleBossCombatService");

const ACAO_COOLDOWN_MS = 600;
const ultimaAcaoEm = new Map();

function salaDaTentativa(idEventEdition, characterId) {
  return `eventpuzzleboss:${idEventEdition}:${characterId}`;
}

function montarPayloadEstado(attempt) {
  const runtime = attempt.runtime_state;
  const { estado: bossEstado, fase } = eventPuzzleBossCombatService.montarEstadoBoss(attempt.boss_snapshot, runtime);
  return {
    attemptId: attempt.id,
    eventEditionId: attempt.id_event_edition,
    nomeBoss: bossEstado.nome,
    imagemBoss: attempt.boss_snapshot.imagem_url,
    vidaJogador: runtime.vida_atual_jogador,
    vidaMaxJogador: attempt.player_snapshot.vidaMax,
    manaJogador: runtime.mana_atual_jogador,
    manaMaxJogador: attempt.player_snapshot.manaMax,
    vidaBoss: runtime.vida_atual_boss,
    vidaMaxBoss: attempt.boss_snapshot.stats.vida_maxima,
    faseAtual: fase?.nome_exibicao ?? null,
    statusJogador: runtime.status_jogador,
    statusBoss: runtime.status_boss,
    buffsJogador: runtime.buffs_jogador,
    buffsBoss: runtime.buffs_boss,
    cooldownsJogador: runtime.cooldowns_jogador,
    poderes: poderesPublicos(attempt.player_snapshot.poderes ?? []).map((p, indice) => ({
      ...p,
      cooldown: attempt.player_snapshot.poderes[indice]?.cooldown ?? 0,
    })),
    turno: runtime.combat_turn,
  };
}

module.exports = function registerEventPuzzleBossHandlers(io) {
  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.EVENTPUZZLEBOSS.ENTRAR, async ({ eventEditionId } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.ERRO, { mensagem: "Identifique seu personagem antes de entrar." });
      }
      try {
        const { attempt } = await sequelize.transaction((transaction) =>
          eventPuzzleBossAttemptService.entrarOuRetomar(characterId, eventEditionId, transaction),
        );
        socket.join(salaDaTentativa(attempt.id_event_edition, characterId));
        socket.emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.ESTADO, montarPayloadEstado(attempt));
      } catch (error) {
        const mensagem = error.statusCode ? error.message : "Não foi possível entrar na luta contra o Custódio.";
        if (!error.statusCode) console.error("Erro ao entrar na luta do Custódio do Meridiano:", error);
        socket.emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.ERRO, { mensagem, ...(error.code ? { code: error.code } : {}) });
      }
    });

    socket.on(SOCKET_EVENTS.EVENTPUZZLEBOSS.SAIR, ({ eventEditionId } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      socket.leave(salaDaTentativa(eventEditionId, characterId));
    });

    // Sem "tipo: item" de propósito (mesmo critério do Templo — nunca
    // aceitar consumível contra um boss solo) — validado de novo dentro
    // de eventPuzzleBossCombatService.resolverTurno, nunca só aqui.
    socket.on(SOCKET_EVENTS.EVENTPUZZLEBOSS.ACAO, async ({ tipo, idPoder } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;

      const agora = Date.now();
      const ultima = ultimaAcaoEm.get(characterId) ?? 0;
      if (agora - ultima < ACAO_COOLDOWN_MS) {
        return socket.emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.ERRO, { mensagem: "Aguarde um instante antes de agir de novo." });
      }

      try {
        const resultado = await sequelize.transaction(async (transaction) => {
          const attempt = await EventPuzzleBossAttempt.findOne({
            where: { character_id: characterId, status: "Ativa" },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!attempt) throw Object.assign(new Error("Você não está em nenhuma luta contra o Custódio do Meridiano."), { statusCode: 400 });

          const turno = await eventPuzzleBossCombatService.resolverTurno(attempt, { tipo, idPoder });

          if (turno.concluido === "Vitoria") {
            await eventPuzzleBossAttemptService.persistirRuntimeState(attempt, turno.runtime, transaction);
            const recompensa = await eventPuzzleBossAttemptService.finalizarVitoria(attempt, transaction);
            return { turno, attempt, recompensa, fim: "Vitoria" };
          }
          if (turno.concluido === "Derrota") {
            await eventPuzzleBossAttemptService.persistirRuntimeState(attempt, turno.runtime, transaction);
            await eventPuzzleBossAttemptService.finalizarDerrota(attempt, transaction);
            return { turno, attempt, recompensa: null, fim: "Derrota" };
          }
          await eventPuzzleBossAttemptService.persistirRuntimeState(attempt, turno.runtime, transaction);
          return { turno, attempt, recompensa: null, fim: null };
        });
        ultimaAcaoEm.set(characterId, agora);

        const sala = salaDaTentativa(resultado.attempt.id_event_edition, characterId);
        if (resultado.turno.resultadoBoss?.habilidadeUsada) {
          io.to(sala).emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.CAST_START, {
            nomePoder: resultado.turno.resultadoBoss.habilidadeUsada.nome,
          });
        }
        io.to(sala).emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.TURNO_RESULTADO, {
          log: resultado.turno.log,
          estado: montarPayloadEstado(resultado.attempt),
        });
        if (resultado.turno.faseAlterada) {
          io.to(sala).emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.FASE_ALTERADA, { fase: resultado.turno.fase?.nome_exibicao ?? null });
        }
        if (resultado.fim) {
          io.to(sala).emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.FIM, {
            vitoria: resultado.fim === "Vitoria",
            recompensa: resultado.recompensa,
          });
        }
      } catch (error) {
        const mensagem = error.statusCode ? error.message : "Erro ao processar sua ação — tente de novo.";
        if (!error.statusCode) console.error("Erro ao processar turno do Custódio do Meridiano:", error);
        socket.emit(SOCKET_EVENTS.EVENTPUZZLEBOSS.ERRO, { mensagem });
      }
    });
  });
};

module.exports.montarPayloadEstado = montarPayloadEstado;
