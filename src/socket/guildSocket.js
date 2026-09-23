// src/socket/guildSocket.js
//
// Chat de guilda em tempo real, com histórico persistido (apagado todo
// mês — ver guildChatService.js). A sala Socket.IO só existe pra quem
// realmente pertence à guilda: o servidor confirma o vínculo
// (GuildMember) antes de deixar entrar, nunca confia em guildId enviado
// solto pelo cliente (seção 13).

const GuildMember = require("../models/GuildMember");
const Character = require("../models/Character");
const { personagemViaTicket } = require("./socketAuth");
const guildChatService = require("../services/guildChatService");

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

// characterId -> Set<socket> — permite ao guildController tirar um
// membro da sala IMEDIATAMENTE ao sair/ser expulso (spec §51), em vez
// de esperar ele tentar mandar mensagem de novo (checagem que já
// existia em "guild:message"). Um personagem pode ter mais de um
// socket (múltiplas abas), por isso é um Set, não um socket só.
const socketsPorPersonagem = new Map();

function registrarSocketDoPersonagem(characterId, socket) {
  if (!socketsPorPersonagem.has(characterId)) socketsPorPersonagem.set(characterId, new Set());
  socketsPorPersonagem.get(characterId).add(socket);
}

function removerRegistroDoSocket(characterId, socket) {
  const conjunto = socketsPorPersonagem.get(characterId);
  if (!conjunto) return;
  conjunto.delete(socket);
  if (conjunto.size === 0) socketsPorPersonagem.delete(characterId);
}

function removerDaSalaDeGuild(characterId) {
  const conjunto = socketsPorPersonagem.get(characterId);
  if (!conjunto) return;
  for (const socket of conjunto) {
    if (socket.guildRoom) {
      socket.leave(socket.guildRoom);
      socket.guildRoom = null;
      socket.emit("guild:removido-da-sala");
    }
  }
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
    socket.on("guild:identificar", async ({ ticket } = {}, callback) => {
      // characterId só vem do ticket verificado, nunca do que o cliente
      // mandar direto (senão qualquer socket conseguia falar/ouvir o
      // chat de guilda de outro personagem).
      const characterId = await personagemViaTicket(ticket);
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Ticket inválido ou expirado." });
      }
      socket.characterId = characterId;
      // personagemViaTicket consulta o banco (await) — sem um ack aqui,
      // o cliente que dispara "guild:join-room" logo em seguida (sem
      // esperar nada) corria contra essa consulta e quase sempre
      // GANHAVA a corrida: o handler de join-room roda seu primeiro
      // `if (!characterId)` de forma síncrona, antes do await acima
      // terminar, então socket.characterId ainda estava undefined.
      // Resultado batido com um script de reprodução real: join-room
      // respondia "Identifique seu personagem antes." e guild:message,
      // mandado logo depois, era descartado em silêncio — a causa raiz
      // do "chat da guilda não envia mensagem".
      if (typeof callback === "function") callback({ ok: true });
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
        registrarSocketDoPersonagem(characterId, socket);
        const historico = await guildChatService.buscarHistorico(membro.id_guild);
        if (typeof callback === "function") callback({ idGuild: membro.id_guild, historico });
      } catch (error) {
        console.error("Erro ao entrar na sala da guilda:", error);
        if (typeof callback === "function") callback({ erro: "Erro ao entrar na sala da guilda." });
      }
    });

    socket.on("guild:message", async ({ texto } = {}) => {
      const characterId = socket.characterId;
      if (!characterId || !socket.guildRoom) {
        // Antes retornava em silêncio — se algum cliente (ou uma versão
        // desatualizada do frontend em cache) ainda mandar guild:message
        // cedo demais, ao menos agora ele recebe um erro visível em vez
        // da mensagem simplesmente sumir sem explicação nenhuma.
        return socket.emit("guild:erro", {
          mensagem: "Conexão do chat ainda não está pronta. Aguarde um instante e tente de novo.",
        });
      }

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
        await guildChatService.persistirMensagem({
          idGuild: membro.id_guild,
          idPersonagem: personagem.id,
          nomePersonagem: personagem.nome,
          texto: mensagem,
        });
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
      if (socket.characterId) removerRegistroDoSocket(socket.characterId, socket);
    });
  });
};

module.exports.salaDaGuild = salaDaGuild;
module.exports.emitParaGuild = emitParaGuild;
module.exports.removerDaSalaDeGuild = removerDaSalaDeGuild;
