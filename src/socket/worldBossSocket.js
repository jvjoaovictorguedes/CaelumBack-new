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
const { personagemViaTicket } = require("./socketAuth");

// worldBossCombatService exige ESTE arquivo de volta (pra emitGlobal) —
// um require no topo aqui criaria um ciclo e um dos dois lados sempre
// pegaria o exports pela metade, dependendo de qual arquivo carrega
// primeiro (visto na prática: emitGlobal virando undefined dentro de
// executarAcao). Um require tardio, só na hora de usar, quebra o ciclo
// sem tocar no outro lado.
function combatService() {
  return require("../services/worldBossCombatService");
}

const SALA_GLOBAL = "worldboss:global";

let ioRegistrado = null;

function emitGlobal(evento, payload) {
  ioRegistrado?.to(SALA_GLOBAL).emit(evento, payload);
}

// Ameaça Mundial V2 §17 — combate autenticado por socket. Evento
// PRÓPRIO "worldboss:identificar" (não o "identificar" genérico do
// pvpLiveSocket): o mesmo bug real já documentado em guildSocket.js
// se repetiria aqui — io.on("connection") do pvpLiveSocket dispara
// pra QUALQUER conexão nova no mesmo `io`, então usar o nome genérico
// faria a conexão própria do WorldBossSocketContext (front) ser lida
// como uma reconexão do personagem no PvP ao vivo e derrubar o socket
// de duelo de verdade.
//
// client_action_id (§17.2) — dedupe por characterId: um resend do
// mesmo id (retry de rede, reconexão) devolve a MESMA resposta já
// dada, nunca reprocessa a ação (nunca dobra o dano/gasto de mana).
// Só guarda a ÚLTIMA ação por personagem (não um histórico) — o
// cliente nunca reenvia uma ação de dois "client_action_id"
// diferentes atrás, só a mais recente pendente de ack.
const ultimaAcaoPorPersonagem = new Map();

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

    // characterId nunca vem do cliente — só do ticket de curta duração
    // (mesmo padrão de pvpLiveSocket/guildSocket §24). Sem isso, qualquer
    // socket conectado conseguia atacar a Ameaça Mundial se passando por
    // outro personagem.
    socket.on("worldboss:identificar", async ({ ticket } = {}, callback) => {
      const characterId = await personagemViaTicket(ticket);
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Ticket inválido ou expirado." });
      }
      socket.characterId = characterId;
      if (typeof callback === "function") callback({ ok: true });
    });

    socket.on("worldboss:entrar-combate", async (_payload, callback) => {
      const characterId = socket.characterId;
      if (!characterId) {
        return typeof callback === "function" && callback({ erro: "Identifique seu personagem antes de entrar em combate." });
      }
      try {
        const resultado = await combatService().entrar(characterId);
        socket.join(SALA_GLOBAL);
        if (typeof callback === "function") callback({ ok: true, ...resultado });
      } catch (error) {
        if (typeof callback === "function") callback({ ok: false, erro: error.message ?? "Não foi possível entrar em combate." });
      }
    });

    // Resync (§17.3) — reaproveita worldBossCombatService.entrar, que já
    // é idempotente (retoma a sessão Ativa em vez de criar outra): pedir
    // o estado de novo depois de uma queda de conexão nunca duplica nada.
    socket.on("worldboss:estado", async (_payload, callback) => {
      try {
        const characterId = socket.characterId;
        if (!characterId) {
          const status = await worldBossStatusService.obterStatusPublico();
          return typeof callback === "function" && callback({ ok: true, status });
        }
        const resultado = await combatService().entrar(characterId);
        if (typeof callback === "function") callback({ ok: true, ...resultado });
      } catch (error) {
        if (typeof callback === "function") callback({ ok: false, erro: error.message ?? "Não foi possível obter o estado atual." });
      }
    });

    // event_id recebido aqui é só informativo — NUNCA decide contra qual
    // evento a ação vale (§3.1: "nunca aceitar character_id arbitrário",
    // mesmo raciocínio pro evento). worldBossCombatService.executarAcao
    // já resolve isso pela sessão Ativa do próprio characterId no banco.
    socket.on("worldboss:acao", async ({ client_action_id, tipo, id_poder } = {}, callback) => {
      const characterId = socket.characterId;
      if (!characterId) {
        const resposta = { accepted: false, erro: "Identifique seu personagem antes de agir." };
        return typeof callback === "function" && callback(resposta);
      }

      if (client_action_id) {
        const ultima = ultimaAcaoPorPersonagem.get(characterId);
        if (ultima && ultima.clientActionId === client_action_id) {
          return typeof callback === "function" && callback(ultima.resposta);
        }
      }

      try {
        const resultado = await combatService().executarAcao(characterId, { tipo, idPoder: id_poder });
        const resposta = {
          accepted: true,
          server_action_seq: resultado.action_seq,
          dano: resultado.dano,
          esquivou: resultado.esquivou,
          cura: resultado.cura,
          manaCurada: resultado.manaCurada,
          golpeFinal: resultado.golpeFinal,
          proezasConquistadas: resultado.proezasConquistadas,
          lutador: resultado.lutador,
          boss: resultado.boss,
        };
        if (client_action_id) ultimaAcaoPorPersonagem.set(characterId, { clientActionId: client_action_id, resposta });
        if (typeof callback === "function") callback(resposta);
      } catch (error) {
        const resposta = { accepted: false, erro: error.message ?? "Não foi possível executar a ação." };
        if (typeof callback === "function") callback(resposta);
      }
    });
  });
};

module.exports.emitGlobal = emitGlobal;
