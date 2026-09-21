const { buscarBatalha, moverParaAtaque } = require("../services/battleService");

module.exports = function registerBattleHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("battle:join", async ({ battleId } = {}) => {
      try {
        if (!battleId) {
          return socket.emit("battle:error", {
            message: "battleId obrigatório.",
          });
        }

        const battle = await buscarBatalha(battleId);

        if (!battle) {
          return socket.emit("battle:error", {
            message: "Batalha não encontrada.",
          });
        }

        const room = `battle:${battleId}`;

        socket.join(room);

        socket.emit("battle:state", serializarBatalha(battle));

        socket.to(room).emit("battle:player-joined", {
          battleId,
        });
      } catch (error) {
        console.error("Erro ao entrar na batalha:", error);

        socket.emit("battle:error", {
          message: "Não foi possível entrar na batalha.",
        });
      }
    });

    socket.on(
      "battle:attack",
      async ({ battleId, attackerId, targetId } = {}) => {
        try {
          const room = `battle:${battleId}`;

          const movimento = await moverParaAtaque({
            battleId,
            attackerId,
            targetId,
          });

          /*
           * Primeiro todos recebem o movimento.
           */
          io.to(room).emit("battle:unit-move", movimento);

          /*
           * Depois podemos resolver o dano.
           *
           * Aqui vamos conectar o motor de combate
           * existente.
           */

          // TODO:
          // resolverDano(...)
          // emitir battle:damage
        } catch (error) {
          console.error("Erro no ataque:", error);

          socket.emit("battle:error", {
            message: error.message,
          });
        }
      },
    );

    socket.on("battle:leave", ({ battleId } = {}) => {
      if (!battleId) return;

      socket.leave(`battle:${battleId}`);
    });
  });
};

function serializarBatalha(battle) {
  return {
    id: battle.id,
    status: battle.status,
    turn_number: battle.turn_number,

    participants: battle.participants.map((participant) => ({
      id: participant.id,

      character_id: participant.character_id,

      enemy_id: participant.enemy_id,

      type: participant.unit_type,

      team: participant.team,

      name: participant.name,

      level: participant.level,

      hp: participant.hp,

      maxHp: participant.max_hp,

      mana: participant.mana,

      maxMana: participant.max_mana,

      position: {
        x: participant.x,
        y: participant.y,
      },

      alive: participant.alive,
    })),
  };
}
