const { exclusive } = require("./actionGuardService");
const { check } = require("./actionRateLimitService");
const { gate } = require("./automationChallengeService");
const { recordSignal } = require("./automationTelemetryService");
const events = new Set([
  "pvp:acao",
  "pvp:desafiar",
  "pvp:responder-desafio",
  "party:acao",
  "party:iniciar",
  "party:criar",
  "guildboss:acao",
  "guildboss:entrar",
  "worldboss:acao",
  "worldboss:entrar-combate",
  "templeboss:entrar",
  "templeboss:acao",
  "eventpuzzleboss:entrar",
  "eventpuzzleboss:acao",
]);
const safePoints = new Set([
  "pvp:desafiar",
  "party:iniciar",
  "guildboss:entrar",
  "worldboss:entrar-combate",
  // templeboss:entrar é ponto seguro (mesmo critério de guildboss:entrar/
  // worldboss:entrar-combate acima): resume um attempt já existente ou
  // cria um novo gated por boss_unlocked_at no próprio service, nunca
  // uma ação que move dano/recompensa sozinha. templeboss:acao fica de
  // fora — passa só por rate-limit/exclusive (cada ação resolve dano
  // real), nunca pelo gate de desafio automation.
  "templeboss:entrar",
  // eventpuzzleboss:entrar é o mesmo ponto seguro — resume um attempt já
  // existente ou cria um novo gated por personagemCompletouBlueprint no
  // próprio service (ver eventPuzzleBossAttemptService.entrarOuRetomar),
  // nunca move dano/recompensa sozinho. eventpuzzleboss:acao fica de
  // fora pela mesma razão de templeboss:acao acima.
  "eventpuzzleboss:entrar",
]);
function install(socket) {
  const original = socket.on.bind(socket);
  socket.on = (event, handler) => {
    if (!events.has(event)) return original(event, handler);
    return original(event, async (...args) => {
      if (!socket.characterId) return handler(...args);
      const characterId = Number(socket.characterId);
      try {
        await check(characterId, event);
        if (safePoints.has(event)) await gate(characterId, event);
        return await exclusive(`socket:${characterId}:${event}`, () =>
          handler(...args),
        );
      } catch (error) {
        if (!error.code) {
          console.warn("[antiAutomation] socket action failed");
          return;
        }
        if(error.code === "INVALID_ACTION_STATE") void recordSignal({
          characterId,
          type: "IMPOSSIBLE_CONCURRENCY",
          actionType: event,
          metadata: { transport: "socket" },
        });
        const response = {
          code: error.code,
          mensagem: error.message,
          ...(error.retryAfterMs !== undefined
            ? { retryAfterMs: error.retryAfterMs }
            : {}),
        };
        socket.emit(event.split(":")[0] + ":erro", response);
        const callback = args.at(-1);
        if (typeof callback === "function")
          callback({ accepted: false, ...response });
      }
    });
  };
}
module.exports = { install };
