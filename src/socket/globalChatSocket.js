// src/socket/globalChatSocket.js
//
// Chat global — uma sala só, pro servidor inteiro, pra jogadores se
// comunicarem (vender/comprar itens etc.) sem precisar estar na mesma
// guilda. Mesmo padrão de autenticação/rate-limit/histórico já validado
// em guildSocket.js: o personagem vem sempre do ticket verificado
// (nunca de um characterId que o cliente mande solto), nunca confiando
// em nada vindo direto do payload.

const Character = require("../models/Character");
const { personagemViaTicket } = require("./socketAuth");
const globalChatService = require("../services/globalChatService");

const SALA_GLOBAL = "global-chat";

// Mesma janela deslizante em memória do guildSocket.js (10 mensagens a
// cada 10 segundos por personagem) — chat global tem potencialmente
// MUITO mais gente falando ao mesmo tempo que uma guilda, mas o limite
// é por PERSONAGEM, então o motivo de existir (barrar flood de UM
// cliente) continua o mesmo.
const JANELA_RATE_LIMIT_MS = 10 * 1000;
const MAX_MENSAGENS_NA_JANELA = 10;
const contadorMensagensPorPersonagem = new Map();

function excedeuRateLimit(characterId) {
  const agora = Date.now();
  const registro = contadorMensagensPorPersonagem.get(characterId);

  if (!registro || agora > registro.resetAt) {
    contadorMensagensPorPersonagem.set(characterId, {
      contagem: 1,
      resetAt: agora + JANELA_RATE_LIMIT_MS,
    });
    return false;
  }

  if (registro.contagem >= MAX_MENSAGENS_NA_JANELA) {
    return true;
  }

  registro.contagem += 1;
  return false;
}

module.exports = function registerGlobalChatHandlers(io) {
  io.on("connection", (socket) => {
    // Nome de evento PRÓPRIO (não "identificar" genérico) — mesmo motivo
    // documentado em guildSocket.js: vários sockets "de feature"
    // compartilham o mesmo `io`, e um "identificar" genérico atropela os
    // outros listeners que escutam esse nome.
    socket.on("globalchat:identificar", async ({ ticket } = {}, callback) => {
      const characterId = await personagemViaTicket(ticket);
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Ticket inválido ou expirado." });
      }
      socket.characterId = characterId;
      if (typeof callback === "function") callback({ ok: true });
    });

    socket.on("globalchat:entrar", async (_payload, callback) => {
      const characterId = socket.characterId;
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Identifique seu personagem antes." });
      }
      try {
        socket.join(SALA_GLOBAL);
        const historico = await globalChatService.buscarHistorico();
        if (typeof callback === "function") callback({ historico });
      } catch (error) {
        console.error("Erro ao entrar no chat global:", error);
        if (typeof callback === "function") callback({ erro: "Erro ao entrar no chat global." });
      }
    });

    socket.on("globalchat:message", async ({ texto } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit("globalchat:erro", {
          mensagem: "Conexão do chat ainda não está pronta. Aguarde um instante e tente de novo.",
        });
      }

      if (excedeuRateLimit(characterId)) {
        return socket.emit("globalchat:erro", {
          mensagem: "Muitas mensagens em pouco tempo. Aguarde um instante.",
        });
      }

      if (typeof texto !== "string") return;
      const mensagem = texto.trim().slice(0, 500);
      if (!mensagem) return;

      try {
        const personagem = await Character.findByPk(characterId, { attributes: ["id", "nome"] });
        if (!personagem) return;
        await globalChatService.persistirMensagem({
          idPersonagem: personagem.id,
          nomePersonagem: personagem.nome,
          texto: mensagem,
        });
        io.to(SALA_GLOBAL).emit("globalchat:message:new", {
          idPersonagem: personagem.id,
          nome: personagem.nome,
          texto: mensagem,
          data: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Erro ao enviar mensagem no chat global:", error);
      }
    });

    socket.on("disconnect", () => {
      if (socket.rooms?.has(SALA_GLOBAL)) socket.leave(SALA_GLOBAL);
    });
  });
};
