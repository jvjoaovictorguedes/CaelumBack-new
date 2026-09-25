// src/socket/worldBossSocket.js
//
// Boss Global — broadcast do evento server-wide (§11: HP/fase/estado
// em tempo real pra TODO MUNDO conectado, não só quem está atacando).
// Diferente de guildBossSocket.js (sala por guilda, combate em turnos
// dentro da sala): aqui é uma ÚNICA sala global, e quem entra nela só
// recebe broadcasts — o combate individual de cada jogador (Fase 4)
// roda pela API REST normal, não por turno sincronizado em sala.
//
// Mesmo padrão de "handle guardado no módulo" do guildSocket.js
// (emitParaGuild): outros services (scheduler, discovery, combate,
// admin) chamam emitGlobal(...) sem precisar receber `io` por
// injeção de dependência em toda a cadeia de chamadas.

const worldBossStatusService = require("../services/worldBossStatusService");

const SALA_GLOBAL = "worldboss:global";

let ioRegistrado = null;

function emitGlobal(evento, payload) {
  ioRegistrado?.to(SALA_GLOBAL).emit(evento, payload);
}

module.exports = function registerWorldBossHandlers(io) {
  ioRegistrado = io;

  io.on("connection", (socket) => {
    socket.on("worldboss:entrar", async () => {
      socket.join(SALA_GLOBAL);
      try {
        const status = await worldBossStatusService.obterStatusPublico();
        socket.emit("worldboss:status", status);
      } catch (error) {
        console.error("Erro ao enviar status inicial da Ameaça Mundial:", error);
      }
    });

    socket.on("worldboss:sair", () => {
      socket.leave(SALA_GLOBAL);
    });
  });
};

module.exports.emitGlobal = emitGlobal;
