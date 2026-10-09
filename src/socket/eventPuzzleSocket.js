// Evento "O Coração da Máquina Celestial" — Fase 8. Socket.IO só como
// TRANSPORTE/feedback/sincronização (nunca autoridade — PostgreSQL via
// puzzleActionService/aplicarMutacao continua sendo a fonte da
// verdade). A ação de jogo em si NUNCA vem por socket — só HTTP
// (POST /api/events/puzzle-instances/:id/actions), que já passa pelo
// Anti-Automation existente (httpMiddleware.protect) e pelo UPDATE
// condicional real; o socket só entra DEPOIS de uma ação HTTP bem-
// sucedida, pra empurrar o feedback público pra quem mais estiver
// olhando a mesma instância (grupo/espectador), e na reconexão, que usa
// RESYNC pelo estado persistido (o cliente sempre pode re-chamar o GET
// /puzzle-instances/:id — esse socket só evita precisar dar F5).
const SOCKET_EVENTS = require("../contracts/socketEvents");
const { personagemViaTicket } = require("./socketAuth");
const puzzleInstanceService = require("../services/puzzleInstanceService");

function salaDaInstancia(idInstance) {
  return `eventpuzzle:${idInstance}`;
}

// Mesmo padrão de guildSocket.js: guarda `io` num módulo-level pra
// puzzleActionController poder emitir sem precisar injetar `io` em
// toda a cadeia de chamadas (mesmo processo, só um require a mais).
let ioRegistrado = null;

// Chamado pelo controller logo depois de uma ação HTTP bem-sucedida —
// nunca o inverso (o socket nunca decide nem calcula nada, só repassa
// o que o controller/service já persistiu). `pistasDesbloqueadas`
// (Fase 9) é opcional — SOLO hoje não tem "outro espectador" pra ver
// isso em tempo real, mas o payload já carrega pronto pra quando
// MEMBER/co-op existir, sem precisar de uma 2ª forma de emitir.
function emitirAtualizacaoDeInstancia(idInstance, dtoRuntime, eventos, pistasDesbloqueadas = []) {
  ioRegistrado
    ?.to(salaDaInstancia(idInstance))
    .emit(SOCKET_EVENTS.EVENTPUZZLE.ESTADO, { instancia: dtoRuntime, eventos, pistasDesbloqueadas });
}

module.exports = function registerEventPuzzleHandlers(io) {
  ioRegistrado = io;
  io.on("connection", (socket) => {
    // Nome de evento PRÓPRIO (não TRANSPORT.IDENTIFY genérico) — mesmo
    // raciocínio documentado em guildSocket.js: vários módulos de
    // socket escutam o mesmo `io`, e usar um evento compartilhado faz
    // identificar-se num domínio disparar efeito colateral nos outros.
    socket.on(SOCKET_EVENTS.EVENTPUZZLE.IDENTIFICAR, async ({ ticket } = {}, callback) => {
      const characterId = await personagemViaTicket(ticket);
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Ticket inválido ou expirado." });
      }
      socket.characterId = characterId;
      if (typeof callback === "function") callback({ ok: true });
    });

    socket.on(SOCKET_EVENTS.EVENTPUZZLE.ENTRAR, async ({ instanceId } = {}, callback) => {
      const characterId = socket.characterId;
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Identifique seu personagem antes." });
      }
      if (!instanceId) {
        return typeof callback === "function" && callback({ erro: "instanceId é obrigatório." });
      }
      try {
        // Mesma checagem de ownership do HTTP (obterParaPersonagem) —
        // nunca confia no instanceId sozinho pra decidir quem pode
        // entrar na sala; um personagem só entra na sala de uma
        // instância que ele realmente participa.
        const instancia = await puzzleInstanceService.obterParaPersonagem(instanceId, characterId);
        if (socket.eventPuzzleRoom) socket.leave(socket.eventPuzzleRoom);
        const sala = salaDaInstancia(instancia.id);
        socket.join(sala);
        socket.eventPuzzleRoom = sala;
        const dto = puzzleInstanceService.dtoRuntime(instancia);
        socket.emit(SOCKET_EVENTS.EVENTPUZZLE.ESTADO, { instancia: dto, eventos: [] });
        if (typeof callback === "function") callback({ ok: true, instancia: dto });
      } catch (error) {
        const mensagem = error.statusCode ? error.message : "Erro ao entrar na instância de puzzle.";
        if (typeof callback === "function") callback({ erro: mensagem });
        else socket.emit(SOCKET_EVENTS.EVENTPUZZLE.ERRO, { mensagem });
      }
    });

    socket.on(SOCKET_EVENTS.EVENTPUZZLE.SAIR, () => {
      if (socket.eventPuzzleRoom) {
        socket.leave(socket.eventPuzzleRoom);
        socket.eventPuzzleRoom = null;
      }
    });

    socket.on("disconnect", () => {
      socket.eventPuzzleRoom = null;
    });
  });
};

module.exports.emitirAtualizacaoDeInstancia = emitirAtualizacaoDeInstancia;
