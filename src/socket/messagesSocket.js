// src/socket/messagesSocket.js
//
// Mensagens em Tempo Real v2 — Socket.IO complementa o REST
// (messageRoutes.js), nunca o substitui: REST continua sendo carga
// inicial, paginação de histórico, busca de usuários e recuperação
// após reconnect (spec §3). Toda persistência passa por
// messageDeliveryService.js, reaproveitado também pela rota REST — o
// socket aqui só resolve autenticação, presença, rate limit e repassa
// pros eventos certos.
//
// Evento de identificação PRÓPRIO ("message:identificar", não
// "identificar" nem "guild:identificar") pela MESMA razão documentada
// em guildSocket.js: todo `register*Handlers(io)` registra seu próprio
// `io.on("connection")` no MESMO `io`, então um nome de evento genérico
// reusado por dois módulos dispara os dois — reusar "identificar" aqui
// re-acionaria o handler do pvpLiveSocket nesse socket novo e
// derrubaria a conexão de PvP ao vivo do jogador à força (achando que
// era uma reconexão do mesmo personagem).
const { usuarioViaTicket } = require("./socketAuth");
const {
  salaDoUsuario,
  enviarMensagem,
  marcarConversaComoLida,
} = require("../services/messageDeliveryService");

// userId (string) -> Set<socket> — múltiplas abas do mesmo usuário
// devem todas receber message:new/inbox:update/ack (mesmo padrão de
// guildSocket.socketsPorPersonagem, diferente do Map<id,socketId> único
// do pvpLiveSocket, que não precisa disso pra duelo 1x1 por vez).
const onlineUsuarios = new Map();

function chaveUsuario(id) {
  return String(id);
}

function estaUsuarioOnline(idUsuario) {
  return onlineUsuarios.has(chaveUsuario(idUsuario));
}

function registrarSocket(idUsuario, socket) {
  const chave = chaveUsuario(idUsuario);
  if (!onlineUsuarios.has(chave)) onlineUsuarios.set(chave, new Set());
  onlineUsuarios.get(chave).add(socket);
}

function removerSocket(idUsuario, socket) {
  const chave = chaveUsuario(idUsuario);
  const conjunto = onlineUsuarios.get(chave);
  if (!conjunto) return false;
  conjunto.delete(socket);
  if (conjunto.size === 0) {
    onlineUsuarios.delete(chave);
    return true; // ficou offline de vez (nenhuma aba restante)
  }
  return false;
}

// Rate limit socket-side (§15) — espelha os mesmos dois tetos já
// aplicados na rota REST (messageRoutes.js): rajada 5/5s + sustentado
// 30/60s por CONTA. criarLimitador (rateLimitMiddleware.js) é Express-only
// (precisa de req/res/next), então porta o mesmo padrão de janela em
// memória já usado em guildSocket.js, com duas janelas em vez de uma.
const RAJADA_JANELA_MS = 5 * 1000;
const RAJADA_MAX = 5;
const SUSTENTADO_JANELA_MS = 60 * 1000;
const SUSTENTADO_MAX = 30;

const contadorRajada = new Map();
const contadorSustentado = new Map();

function excedeuJanela(mapa, chave, janelaMs, max) {
  const agora = Date.now();
  const registro = mapa.get(chave);
  if (!registro || agora > registro.resetAt) {
    mapa.set(chave, { contagem: 1, resetAt: agora + janelaMs });
    return false;
  }
  if (registro.contagem >= max) return true;
  registro.contagem += 1;
  return false;
}

function excedeuRateLimit(idUsuario) {
  const chave = chaveUsuario(idUsuario);
  // Sempre chama os dois (não usa ||-short-circuit) pra cada janela
  // manter sua própria contagem independente, igual à cadeia de
  // middlewares da rota REST.
  const rajada = excedeuJanela(contadorRajada, chave, RAJADA_JANELA_MS, RAJADA_MAX);
  const sustentado = excedeuJanela(contadorSustentado, chave, SUSTENTADO_JANELA_MS, SUSTENTADO_MAX);
  return rajada || sustentado;
}

// typing:start/stop é efêmero (§13) — nunca vai ao banco. Timeout
// automático no SERVIDOR (além do debounce que o frontend já faz)
// pra nunca deixar o indicador preso caso o cliente caia no meio
// digitando sem mandar o "stop".
const TYPING_TIMEOUT_MS = 5000;
const timersDigitando = new Map(); // `${deUsuario}->${paraUsuario}` -> timeoutHandle

function chaveDigitando(deUsuario, paraUsuario) {
  return `${deUsuario}->${paraUsuario}`;
}

module.exports = function registerMessagesHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("message:identificar", async ({ ticket } = {}) => {
      const idUsuario = await usuarioViaTicket(ticket);
      if (!idUsuario) return socket.emit("message:erro", { mensagem: "Ticket inválido ou expirado." });

      socket.usuarioId = idUsuario;
      registrarSocket(idUsuario, socket);
      socket.join(salaDoUsuario(idUsuario));
      socket.broadcast.emit("message:usuario-online", { idUsuario: Number(idUsuario) });
    });

    socket.on("message:send", async ({ id_destinatario, conteudo, client_message_id } = {}) => {
      const idRemetente = socket.usuarioId;
      if (!idRemetente) {
        return socket.emit("message:erro", { mensagem: "Identifique-se antes de enviar mensagens." });
      }

      if (excedeuRateLimit(idRemetente)) {
        return socket.emit("message:erro", {
          mensagem: "Muitas mensagens em pouco tempo. Aguarde um instante.",
        });
      }

      try {
        const resultado = await enviarMensagem({
          idRemetente,
          idDestinatario: id_destinatario,
          conteudo,
          clientMessageId: client_message_id,
          io,
        });

        if (resultado.erro) {
          return socket.emit("message:erro", { mensagem: resultado.erro });
        }

        // ACK vai pra sala do remetente (todas as abas dele), não só
        // pra este socket — confirma o ID definitivo pro client_message_id
        // usado no envio otimista (§6/§7).
        io.to(salaDoUsuario(idRemetente)).emit("message:ack", {
          clientMessageId: client_message_id ?? null,
          mensagem: resultado.mensagem,
          duplicada: resultado.duplicada === true,
        });
      } catch (error) {
        console.error("Erro ao processar message:send:", error);
        socket.emit("message:erro", { mensagem: "Não foi possível enviar a mensagem agora." });
      }
    });

    socket.on("conversation:read", async ({ id_outro_usuario } = {}) => {
      const idUsuario = socket.usuarioId;
      if (!idUsuario || !id_outro_usuario) return;
      try {
        await marcarConversaComoLida({ idUsuario, idOutroUsuario: id_outro_usuario, io });
      } catch (error) {
        console.error("Erro ao marcar conversa como lida:", error);
      }
    });

    socket.on("typing:start", ({ id_destinatario } = {}) => {
      const idRemetente = socket.usuarioId;
      if (!idRemetente || !id_destinatario) return;

      io.to(salaDoUsuario(id_destinatario)).emit("typing:start", { de_usuario: Number(idRemetente) });

      const chave = chaveDigitando(idRemetente, id_destinatario);
      clearTimeout(timersDigitando.get(chave));
      timersDigitando.set(
        chave,
        setTimeout(() => {
          io.to(salaDoUsuario(id_destinatario)).emit("typing:stop", { de_usuario: Number(idRemetente) });
          timersDigitando.delete(chave);
        }, TYPING_TIMEOUT_MS),
      );
    });

    socket.on("typing:stop", ({ id_destinatario } = {}) => {
      const idRemetente = socket.usuarioId;
      if (!idRemetente || !id_destinatario) return;

      const chave = chaveDigitando(idRemetente, id_destinatario);
      clearTimeout(timersDigitando.get(chave));
      timersDigitando.delete(chave);
      io.to(salaDoUsuario(id_destinatario)).emit("typing:stop", { de_usuario: Number(idRemetente) });
    });

    socket.on("message:listar-online", (_payload, callback) => {
      if (typeof callback !== "function") return;
      callback({ online: Array.from(onlineUsuarios.keys()).map(Number) });
    });

    socket.on("disconnect", () => {
      if (!socket.usuarioId) return;
      const ficouOffline = removerSocket(socket.usuarioId, socket);
      if (ficouOffline) {
        socket.broadcast.emit("message:usuario-offline", { idUsuario: Number(socket.usuarioId) });
      }
    });
  });
};

module.exports.estaUsuarioOnline = estaUsuarioOnline;
module.exports.salaDoUsuario = salaDoUsuario;
