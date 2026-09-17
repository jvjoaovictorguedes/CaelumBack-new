// src/socket/guildSocket.js
//
// Chat de guilda em tempo real (só tempo real no MVP — sem persistir
// histórico, ver decisão registrada na seção 15 do documento de design).
// A sala Socket.IO só existe pra quem realmente pertence à guilda: o
// servidor confirma o vínculo (GuildMember) antes de deixar entrar,
// nunca confia em guildId enviado solto pelo cliente (seção 13).

const GuildMember = require("../models/GuildMember");
const Character = require("../models/Character");

function salaDaGuild(idGuild) {
  return `guild:${idGuild}`;
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
    socket.on("identificar", ({ characterId } = {}) => {
      if (!characterId) return;
      socket.characterId = String(characterId);
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
      const mensagem = String(texto ?? "").trim().slice(0, 500);
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
