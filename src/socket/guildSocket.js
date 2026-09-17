// src/socket/guildSocket.js
//
// Chat de guilda em tempo real (só tempo real no MVP — sem persistir
// histórico, ver decisão registrada na seção 15 do documento de design).
// A sala Socket.IO só existe pra quem realmente pertence à guilda: o
// servidor confirma o vínculo (GuildMember) antes de deixar entrar,
// nunca confia em guildId enviado solto pelo cliente (seção 13).

const GuildMember = require("../models/GuildMember");
const Character = require("../models/Character");
const { personagemViaTicket } = require("./socketAuth");

function salaDaGuild(idGuild) {
  return `guild:${idGuild}`;
}

// O frontend só limitava maxLength=500 — nada impedia um cliente
// forjado disparar "guild:message" em loop pelo socket direto. Mesmo
// padrão de janela deslizante em memória do rateLimitMiddleware HTTP,
// adaptado aqui (socket não passa por middleware Express), chaveado por
// characterId — 10 mensagens a cada 10 segundos.
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

// Guardado pra permitir que o guildController emita eventos (entrada,
// saída, doação) sem precisar passar `io` por injeção de dependência em
// toda a cadeia de chamadas — mesmo processo, só um require a mais.
let ioRegistrado = null;

function emitParaGuild(idGuild, evento, payload) {
  ioRegistrado?.to(salaDaGuild(idGuild)).emit(evento, payload);
}

module.exports = function registerGuildHandlers(io) {
  ioRegistrado = io;
  io.on("connection", (socket) => {
    // Nome de evento PRÓPRIO (não "identificar" genérico) — o mesmo `io`
    // atende tanto guildSocket quanto pvpLiveSocket, e os dois listeners
    // ficam registrados no MESMO objeto `socket` sempre que qualquer um
    // dos dois recebe uma conexão nova (io.on("connection") dispara pra
    // todo mundo). Enquanto os dois escutavam "identificar", abrir o
    // chat da guilda (um socket novo, separado do socket do PvP ao vivo)
    // também disparava o "identificar" do pvpLiveSocket nesse socket
    // novo — que aí registrava esse personagem como "online" no PvP com
    // um socket.id diferente do que já estava lá, e o pvpLiveSocket
    // DESCONECTAVA à força o socket antigo (o de verdade, o do PvP ao
    // vivo) por achar que era uma reconexão. Resultado: só abrir o chat
    // da guilda já derrubava a conexão de PvP ao vivo do jogador.
    socket.on("guild:identificar", async ({ ticket } = {}) => {
      // characterId só vem do ticket verificado, nunca do que o cliente
      // mandar direto (senão qualquer socket conseguia falar/ouvir o
      // chat de guilda de outro personagem).
      const characterId = await personagemViaTicket(ticket);
      if (!characterId) return;
      socket.characterId = characterId;
    });

    socket.on("guild:join-room", async (_payload, callback) => {
      const characterId = socket.characterId;
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Identifique seu personagem antes." });
      }
      try {
        const membro = await GuildMember.findOne({ where: { id_personagem: characterId } });
        if (!membro) {
          return typeof callback === "function" && callback({ erro: "Você não pertence a nenhuma guilda." });
        }
        if (socket.guildRoom) socket.leave(socket.guildRoom);
        socket.guildRoom = salaDaGuild(membro.id_guild);
        socket.join(socket.guildRoom);
        if (typeof callback === "function") callback({ idGuild: membro.id_guild });
      } catch (error) {
        console.error("Erro ao entrar na sala da guilda:", error);
        if (typeof callback === "function") callback({ erro: "Erro ao entrar na sala da guilda." });
      }
    });

    socket.on("guild:message", async ({ texto } = {}) => {
      const characterId = socket.characterId;
      if (!characterId || !socket.guildRoom) return;

      if (excedeuRateLimit(characterId)) {
        return socket.emit("guild:erro", {
          mensagem: "Muitas mensagens em pouco tempo. Aguarde um instante.",
        });
      }

      if (typeof texto !== "string") return;
      const mensagem = texto.trim().slice(0, 500);
      if (!mensagem) return;

      try {
        // Reconfere o vínculo a cada mensagem, não só no join: sem isso,
        // um personagem expulso/que saiu continuava falando e ouvindo o
        // chat da guilda antiga até desconectar o socket.
        const membro = await GuildMember.findOne({ where: { id_personagem: characterId } });
        if (!membro || salaDaGuild(membro.id_guild) !== socket.guildRoom) {
          socket.leave(socket.guildRoom);
          socket.guildRoom = null;
          return;
        }

        const personagem = await Character.findByPk(characterId, { attributes: ["id", "nome"] });
        if (!personagem) return;
        io.to(socket.guildRoom).emit("guild:message:new", {
          idPersonagem: personagem.id,
          nome: personagem.nome,
          texto: mensagem,
          data: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Erro ao enviar mensagem de guilda:", error);
      }
    });

    socket.on("disconnect", () => {
      if (socket.guildRoom) socket.leave(socket.guildRoom);
    });
  });
};

module.exports.salaDaGuild = salaDaGuild;
module.exports.emitParaGuild = emitParaGuild;
