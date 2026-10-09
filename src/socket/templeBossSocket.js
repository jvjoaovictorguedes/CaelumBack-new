// src/socket/templeBossSocket.js
//
// Templo do Véu Celestial (templo_veu_celestial_v1_caelum.docx) — Fase
// 5: Provação Final contra o Guardião (§8/§11.3). Solo de propósito:
// diferente de guildBossSocket.js/worldBossSocket.js, não existe
// "ordem" de aliados nem sala compartilhada — cada ação do jogador já
// resolve O TURNO INTEIRO (jogador + contra-ataque do Guardião) numa
// única chamada, sempre dentro de UMA transaction (lock da tentativa +
// persistência do runtime_state + grants de vitória, tudo atômico).
// Estado em memória só serve pra rate-limit do gesto (§14.1
// player_action_cooldown_ms) — a autoridade real é sempre
// TempleBossAttempt.runtime_state no banco, nunca um Map que se perde
// num restart (§11.3 "persistir attempt/runtime suficiente pra resync
// sem duplicar recompensa").
const SOCKET_EVENTS = require("../contracts/socketEvents");
const { sequelize } = require("../config/database");
const TempleBossAttempt = require("../models/TempleBossAttempt");
const templeBossAttemptService = require("../services/templeBossAttemptService");
const templeBossCombatService = require("../services/templeBossCombatService");
const gameSettingCache = require("../services/gameSettingCache");
const { GAME_SETTINGS_DEFAULT } = require("../config/templeConfig");

// characterId (string) -> timestamp (ms) da última ação aceita.
const ultimaAcaoEm = new Map();

function salaDoPersonagem(characterId) {
  return `templeboss:${characterId}`;
}

function montarPayloadEstado(attempt) {
  const runtime = attempt.runtime_state;
  const { estado: bossEstado, fase } = templeBossCombatService.montarEstadoBoss(attempt.boss_snapshot, runtime);
  return {
    attemptId: attempt.id,
    eventId: attempt.id_event,
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
    poderes: (attempt.player_snapshot.poderes ?? []).map((p) => ({
      id: p.id,
      nome: p.nome,
      custo_mana: p.custo_mana,
      cooldown: p.cooldown,
    })),
    turno: runtime.combat_turn,
  };
}

module.exports = function registerTempleBossHandlers(io) {
  io.on("connection", (socket) => {
    socket.on(SOCKET_EVENTS.TEMPLEBOSS.ENTRAR, async () => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit(SOCKET_EVENTS.TEMPLEBOSS.ERRO, { mensagem: "Identifique seu personagem antes de entrar." });
      }
      try {
        const { attempt } = await sequelize.transaction((transaction) =>
          templeBossAttemptService.entrarOuRetomar(characterId, transaction),
        );
        socket.join(salaDoPersonagem(characterId));
        socket.emit(SOCKET_EVENTS.TEMPLEBOSS.ESTADO, montarPayloadEstado(attempt));
      } catch (error) {
        const mensagem = error.statusCode ? error.message : "Não foi possível entrar na luta do Guardião.";
        if (!error.statusCode) console.error("Erro ao entrar na luta do Guardião:", error);
        socket.emit(SOCKET_EVENTS.TEMPLEBOSS.ERRO, { mensagem });
      }
    });

    socket.on(SOCKET_EVENTS.TEMPLEBOSS.SAIR, () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      socket.leave(salaDoPersonagem(characterId));
    });

    // Sem "tipo: item" de propósito (§8.1 "sem consumíveis") — validado
    // de novo dentro de templeBossCombatService.resolverTurno, nunca só
    // aqui (defesa em profundidade contra request forjada).
    socket.on(SOCKET_EVENTS.TEMPLEBOSS.ACAO, async ({ tipo, idPoder } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;

      const agora = Date.now();
      const ultima = ultimaAcaoEm.get(characterId) ?? 0;
      const cooldownMs = gameSettingCache.obter(
        "temple.boss.player_action_cooldown_ms",
        GAME_SETTINGS_DEFAULT["temple.boss.player_action_cooldown_ms"],
      );
      if (agora - ultima < cooldownMs) {
        return socket.emit(SOCKET_EVENTS.TEMPLEBOSS.ERRO, { mensagem: "Aguarde um instante antes de agir de novo." });
      }

      try {
        const resultado = await sequelize.transaction(async (transaction) => {
          const attempt = await TempleBossAttempt.findOne({
            where: { character_id: characterId, status: "Ativa" },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!attempt) throw Object.assign(new Error("Você não está em nenhuma luta contra o Guardião."), { statusCode: 400 });

          const turno = await templeBossCombatService.resolverTurno(attempt, { tipo, idPoder });

          if (turno.concluido === "Vitoria") {
            await templeBossAttemptService.persistirRuntimeState(attempt, turno.runtime, transaction);
            const recompensa = await templeBossAttemptService.finalizarVitoria(attempt, transaction);
            return { turno, attempt, recompensa, fim: "Vitoria" };
          }
          if (turno.concluido === "Derrota") {
            await templeBossAttemptService.persistirRuntimeState(attempt, turno.runtime, transaction);
            await templeBossAttemptService.finalizarDerrota(attempt, transaction);
            return { turno, attempt, recompensa: null, fim: "Derrota" };
          }
          await templeBossAttemptService.persistirRuntimeState(attempt, turno.runtime, transaction);
          return { turno, attempt, recompensa: null, fim: null };
        });
        ultimaAcaoEm.set(characterId, agora);

        const sala = salaDoPersonagem(characterId);
        if (resultado.turno.resultadoBoss?.habilidadeUsada) {
          io.to(sala).emit(SOCKET_EVENTS.TEMPLEBOSS.CAST_START, {
            nomePoder: resultado.turno.resultadoBoss.habilidadeUsada.nome,
          });
        }
        io.to(sala).emit(SOCKET_EVENTS.TEMPLEBOSS.TURNO_RESULTADO, {
          log: resultado.turno.log,
          estado: montarPayloadEstado(resultado.attempt),
        });
        if (resultado.turno.faseAlterada) {
          io.to(sala).emit(SOCKET_EVENTS.TEMPLEBOSS.FASE_ALTERADA, { fase: resultado.turno.fase?.nome_exibicao ?? null });
        }
        if (resultado.fim) {
          io.to(sala).emit(SOCKET_EVENTS.TEMPLEBOSS.FIM, {
            vitoria: resultado.fim === "Vitoria",
            recompensa: resultado.recompensa,
          });
        }
      } catch (error) {
        const mensagem = error.statusCode ? error.message : "Erro ao processar sua ação — tente de novo.";
        if (!error.statusCode) console.error("Erro ao processar turno do Guardião:", error);
        socket.emit(SOCKET_EVENTS.TEMPLEBOSS.ERRO, { mensagem });
      }
    });
  });
};

module.exports.montarPayloadEstado = montarPayloadEstado;
