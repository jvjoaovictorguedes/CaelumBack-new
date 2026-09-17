// src/socket/pvpLiveSocket.js
//
// PVP "ao vivo": os dois jogadores precisam estar online ao mesmo tempo,
// o duelo é por turnos com um prazo de resposta pro jogador da vez, e um
// desafio que não é aceito a tempo expira sozinho. Complementa (não
// substitui) o duelo assíncrono de pvpController.js/challenge, que
// continua funcionando mesmo com o oponente offline.
//
// Estado guardado em memória do processo — não precisa sobreviver a um
// restart do servidor, então não há necessidade de persistir em banco
// enquanto o duelo está em andamento (só o resultado final é persistido,
// via pvpController.aplicarResultadoDuelo).

const Character = require("../models/Character");
const Class = require("../models/Class");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("../services/combatFormulas");
const { aplicarAcao } = require("../services/duelEngine");
const { buscarPoderesDoPersonagem, aplicarResultadoDuelo } = require("../controllers/pvpController");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { personagemViaTicket } = require("./socketAuth");

const NOME_ARENA = "Arena de Caelum";
const PRAZO_ACEITAR_MS = 20000;
const PRAZO_TURNO_MS = 5000;
const MAX_ACOES = 80;

// characterId (string) -> socket.id
const online = new Map();
// characterId do desafiado (string) -> { desafianteId, timeoutHandle }
const desafiosPendentes = new Map();
// duelId -> duelo
const duelos = new Map();
// characterId (string) -> duelId
const duelPorPersonagem = new Map();

let proximoDuelId = 1;

function chaveOnline(id) {
  return String(id);
}

async function carregarLutador(characterId) {
  const personagem = await Character.findByPk(characterId, { include: [{ model: Class }] });
  if (!personagem) return null;
  const poderes = await buscarPoderesDoPersonagem(characterId);
  const bonus = await buscarBonusDeAtributos(characterId);
  const base = comMultiplicadoresDeClasse(
    personagemComBonus(personagem.toJSON(), bonus),
    personagem.Class,
  );
  return {
    id: base.id,
    nome: base.nome,
    genero: base.genero,
    classe: personagem.Class?.nome,
    poderes,
    estado: {
      ...base,
      vida_atual: vidaMaximaDe(base),
      mana_atual: manaMaximaDe(base),
    },
    vidaMax: vidaMaximaDe(base),
    manaMax: manaMaximaDe(base),
  };
}

function limparDesafioPendente(desafiadoId) {
  const pendente = desafiosPendentes.get(chaveOnline(desafiadoId));
  if (pendente) {
    clearTimeout(pendente.timeoutHandle);
    desafiosPendentes.delete(chaveOnline(desafiadoId));
  }
}

function poderesPublicos(poderes) {
  return poderes.map((p) => ({
    id: p.id,
    nome: p.nome,
    custo_mana: p.custo_mana,
    dano_base: p.dano_base,
    cura_base: p.cura_base,
  }));
}

module.exports = function registerPvpLiveHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("identificar", async ({ ticket } = {}) => {
      // O characterId nunca vem do cliente — só do ticket de curta
      // duração emitido via GET /api/users/socket-ticket (autenticado
      // por JWT), senão qualquer socket conectado conseguia agir como
      // qualquer personagem só informando o ID certo.
      const characterId = await personagemViaTicket(ticket);
      if (!characterId) return socket.emit("pvp:erro", { mensagem: "Ticket inválido ou expirado." });
      const chave = chaveOnline(characterId);

      // Se esse characterId já tinha outro socket identificado (aba
      // antiga, reconexão, ou alguém tentando "roubar" o turno de um
      // duelo ao vivo agindo por um personagem que não é o seu), derruba
      // o socket antigo em vez de deixar os dois agirem como o mesmo
      // personagem — nenhum dos dois falaria pelo personagem errado, mas
      // sem isso dava pra ter duas conexões controlando o mesmo lado de
      // um duelo em andamento.
      const socketIdAntigo = online.get(chave);
      if (socketIdAntigo && socketIdAntigo !== socket.id) {
        const socketAntigo = io.sockets.sockets.get(socketIdAntigo);
        socketAntigo?.disconnect(true);
      }

      socket.characterId = chave;
      online.set(chave, socket.id);
      socket.broadcast.emit("pvp:ficou-online", { characterId: chave });
    });

    socket.on("pvp:listar-online", (_payload, callback) => {
      const ids = Array.from(online.keys()).filter((id) => id !== socket.characterId);
      if (typeof callback === "function") callback({ online: ids });
    });

    socket.on("pvp:desafiar", async ({ idDesafiado } = {}) => {
      const idDesafiante = socket.characterId;
      if (!idDesafiante) {
        return socket.emit("pvp:erro", { mensagem: "Identifique seu personagem antes de desafiar." });
      }
      if (!idDesafiado || String(idDesafiado) === idDesafiante) {
        return socket.emit("pvp:erro", { mensagem: "Escolha um oponente válido." });
      }
      if (!online.has(chaveOnline(idDesafiado))) {
        return socket.emit("pvp:erro", { mensagem: "Esse jogador não está online agora." });
      }
      if (duelPorPersonagem.has(idDesafiante) || duelPorPersonagem.has(chaveOnline(idDesafiado))) {
        return socket.emit("pvp:erro", { mensagem: "Um dos dois já está em um duelo." });
      }
      if (desafiosPendentes.has(chaveOnline(idDesafiado))) {
        return socket.emit("pvp:erro", { mensagem: "Esse jogador já tem um desafio pendente." });
      }

      const desafiante = await Character.findByPk(idDesafiante);
      if (!desafiante) {
        return socket.emit("pvp:erro", { mensagem: "Personagem desafiante não encontrado." });
      }

      const socketIdDesafiado = online.get(chaveOnline(idDesafiado));
      const timeoutHandle = setTimeout(() => {
        desafiosPendentes.delete(chaveOnline(idDesafiado));
        socket.emit("pvp:desafio-expirado", { idDesafiado });
        io.to(socketIdDesafiado).emit("pvp:desafio-cancelado", { idDesafiante });
      }, PRAZO_ACEITAR_MS);

      desafiosPendentes.set(chaveOnline(idDesafiado), {
        idDesafiante,
        socketIdDesafiante: socket.id,
        timeoutHandle,
      });

      socket.emit("pvp:desafio-enviado", { idDesafiado, prazoSegundos: PRAZO_ACEITAR_MS / 1000 });
      io.to(socketIdDesafiado).emit("pvp:desafio-recebido", {
        idDesafiante,
        nomeDesafiante: desafiante.nome,
        prazoSegundos: PRAZO_ACEITAR_MS / 1000,
      });
    });

    socket.on("pvp:responder-desafio", async ({ aceitar } = {}) => {
      const idDesafiado = socket.characterId;
      if (!idDesafiado) return;
      const pendente = desafiosPendentes.get(idDesafiado);
      if (!pendente) {
        return socket.emit("pvp:erro", { mensagem: "Esse desafio não existe mais." });
      }
      limparDesafioPendente(idDesafiado);

      if (!aceitar) {
        io.to(pendente.socketIdDesafiante).emit("pvp:desafio-recusado", { idDesafiado });
        return;
      }

      if (!online.has(pendente.idDesafiante)) {
        return socket.emit("pvp:erro", { mensagem: "O desafiante saiu antes de você aceitar." });
      }

      try {
        const [lutadorA, lutadorB] = await Promise.all([
          carregarLutador(pendente.idDesafiante),
          carregarLutador(idDesafiado),
        ]);
        if (!lutadorA || !lutadorB) {
          throw new Error("Personagem não encontrado ao montar o duelo.");
        }

        const duelId = proximoDuelId++;
        const sala = `duelo:${duelId}`;
        const primeiro = lutadorA.estado.velocidade >= lutadorB.estado.velocidade ? "A" : "B";

        const duelo = {
          id: duelId,
          sala,
          a: lutadorA,
          b: lutadorB,
          turnoDe: primeiro,
          acoes: 0,
          timer: null,
        };
        duelos.set(duelId, duelo);
        duelPorPersonagem.set(pendente.idDesafiante, duelId);
        duelPorPersonagem.set(idDesafiado, duelId);

        const socketA = io.sockets.sockets.get(pendente.socketIdDesafiante);
        const socketB = io.sockets.sockets.get(socket.id);
        socketA?.join(sala);
        socketB?.join(sala);

        io.to(sala).emit("pvp:duelo-iniciado", {
          duelId,
          arena: NOME_ARENA,
          a: { id: lutadorA.id, nome: lutadorA.nome, genero: lutadorA.genero, classe: lutadorA.classe, chave: "A" },
          b: { id: lutadorB.id, nome: lutadorB.nome, genero: lutadorB.genero, classe: lutadorB.classe, chave: "B" },
          vidaMaxA: lutadorA.vidaMax,
          vidaMaxB: lutadorB.vidaMax,
          manaMaxA: lutadorA.manaMax,
          manaMaxB: lutadorB.manaMax,
          vidaA: lutadorA.estado.vida_atual,
          vidaB: lutadorB.estado.vida_atual,
          manaA: lutadorA.estado.mana_atual,
          manaB: lutadorB.estado.mana_atual,
          poderesA: poderesPublicos(lutadorA.poderes),
          poderesB: poderesPublicos(lutadorB.poderes),
          turnoDe: primeiro,
          prazoSegundos: PRAZO_TURNO_MS / 1000,
        });

        iniciarTimerDeTurno(io, duelId);
      } catch (error) {
        console.error("Erro ao iniciar duelo ao vivo:", error);
        socket.emit("pvp:erro", { mensagem: "Não foi possível iniciar o duelo." });
      }
    });

    socket.on("pvp:acao", ({ tipo, idPoder } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const duelId = duelPorPersonagem.get(characterId);
      if (!duelId) return socket.emit("pvp:erro", { mensagem: "Você não está em nenhum duelo." });

      const duelo = duelos.get(duelId);
      if (!duelo) return;

      const chave = duelo.a.id === Number(characterId) ? "A" : "B";
      if (duelo.turnoDe !== chave) {
        return socket.emit("pvp:erro", { mensagem: "Ainda não é seu turno." });
      }

      const lutadorAtacante = chave === "A" ? duelo.a : duelo.b;
      let acao = { tipo: "attack" };

      if (tipo === "power") {
        const power = lutadorAtacante.poderes.find((p) => p.id === Number(idPoder));
        if (!power) {
          return socket.emit("pvp:erro", { mensagem: "Poder inválido." });
        }
        if (power.custo_mana > lutadorAtacante.estado.mana_atual) {
          return socket.emit("pvp:erro", { mensagem: "Mana insuficiente para esse poder." });
        }
        acao = { tipo: "power", power };
      }

      executarTurno(io, duelId, chave, acao);
    });

    socket.on("disconnect", () => {
      if (!socket.characterId) return;
      const characterId = socket.characterId;

      // Um novo socket autenticado pro MESMO personagem já derruba o
      // antigo em "identificar" (acima) e assume `online.get(characterId)`
      // antes desse handler rodar (o disconnect do socket antigo só
      // dispara depois, de forma assíncrona). Então, se o mapeamento já
      // não aponta mais pra este socket, isso é uma reconexão/substituição
      // — não uma desistência de verdade — e não pode limpar desafios
      // pendentes nem, principalmente, dar a vitória de um duelo em
      // andamento pro oponente. Só trata como desconexão real quando este
      // ainda é o socket "dono" do personagem.
      const eraSocketAtivo = online.get(characterId) === socket.id;
      if (!eraSocketAtivo) return;

      online.delete(characterId);
      socket.broadcast.emit("pvp:ficou-offline", { characterId });

      limparDesafioPendente(characterId);
      for (const [idDesafiado, pendente] of desafiosPendentes.entries()) {
        if (pendente.idDesafiante === characterId) {
          clearTimeout(pendente.timeoutHandle);
          desafiosPendentes.delete(idDesafiado);
          const socketIdDesafiado = online.get(idDesafiado);
          if (socketIdDesafiado) {
            io.to(socketIdDesafiado).emit("pvp:desafio-cancelado", { idDesafiante: characterId });
          }
        }
      }

      const duelId = duelPorPersonagem.get(characterId);
      if (duelId) {
        finalizarDueloPorDesistencia(io, duelId, characterId);
      }
    });
  });
};

function iniciarTimerDeTurno(io, duelId) {
  const duelo = duelos.get(duelId);
  if (!duelo) return;
  clearTimeout(duelo.timer);
  duelo.timer = setTimeout(() => {
    executarTurno(io, duelId, duelo.turnoDe, { tipo: "attack" }, true);
  }, PRAZO_TURNO_MS);
}

function executarTurno(io, duelId, chave, acao, foiAutomatico = false) {
  const duelo = duelos.get(duelId);
  if (!duelo) return;
  clearTimeout(duelo.timer);

  const atacanteInfo = chave === "A" ? duelo.a : duelo.b;
  const defensorInfo = chave === "A" ? duelo.b : duelo.a;
  const vidaMaxAtacante = chave === "A" ? duelo.a.vidaMax : duelo.b.vidaMax;

  const { nomeAcao, dano, cura, esquivou } = aplicarAcao({
    atacante: atacanteInfo.estado,
    defensor: defensorInfo.estado,
    acao,
    vidaMaxAtacante,
  });

  duelo.acoes += 1;

  const payloadTurno = {
    duelId,
    atacante: chave,
    nomeAcao: foiAutomatico ? `${nomeAcao} (tempo esgotado)` : nomeAcao,
    dano,
    cura,
    esquivou,
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
  };

  const acabou = defensorInfo.estado.vida_atual <= 0 || duelo.acoes >= MAX_ACOES;

  if (acabou) {
    let vencedorChave;
    if (defensorInfo.estado.vida_atual <= 0) {
      vencedorChave = chave;
    } else {
      const percA = duelo.a.estado.vida_atual / duelo.a.vidaMax;
      const percB = duelo.b.estado.vida_atual / duelo.b.vidaMax;
      vencedorChave = percA >= percB ? "A" : "B";
    }
    io.to(duelo.sala).emit("pvp:turno-resultado", { ...payloadTurno, turnoDe: null });
    finalizarDuelo(io, duelId, vencedorChave, "combate");
    return;
  }

  duelo.turnoDe = chave === "A" ? "B" : "A";
  payloadTurno.turnoDe = duelo.turnoDe;
  payloadTurno.prazoSegundos = PRAZO_TURNO_MS / 1000;
  io.to(duelo.sala).emit("pvp:turno-resultado", payloadTurno);

  iniciarTimerDeTurno(io, duelId);
}

async function finalizarDuelo(io, duelId, vencedorChave, motivo = "combate") {
  const duelo = duelos.get(duelId);
  if (!duelo) return;
  clearTimeout(duelo.timer);
  duelos.delete(duelId);
  duelPorPersonagem.delete(String(duelo.a.id));
  duelPorPersonagem.delete(String(duelo.b.id));

  const vencedorInfo = vencedorChave === "A" ? duelo.a : duelo.b;
  const perdedorInfo = vencedorChave === "A" ? duelo.b : duelo.a;

  try {
    const [vencedor, perdedor] = await Promise.all([
      Character.findByPk(vencedorInfo.id),
      Character.findByPk(perdedorInfo.id),
    ]);

    const { recompensa, nivelAposVitoria } = await aplicarResultadoDuelo({
      vencedor,
      perdedor,
      rodadas: duelo.acoes,
    });

    io.to(duelo.sala).emit("pvp:duelo-fim", {
      duelId,
      vencedorChave,
      vencedor: { id: vencedor.id, nome: vencedor.nome },
      perdedor: { id: perdedor.id, nome: perdedor.nome },
      recompensa,
      nivelAposVitoria,
      motivo,
    });
  } catch (error) {
    console.error("Erro ao finalizar duelo ao vivo:", error);
    io.to(duelo.sala).emit("pvp:erro", { mensagem: "Erro ao finalizar o duelo." });
  }

  for (const socket of io.sockets.adapter.rooms.get(duelo.sala) || []) {
    io.sockets.sockets.get(socket)?.leave(duelo.sala);
  }
}

async function finalizarDueloPorDesistencia(io, duelId, characterIdQueSaiu) {
  const duelo = duelos.get(duelId);
  if (!duelo) return;
  const vencedorChave = duelo.a.id === Number(characterIdQueSaiu) ? "B" : "A";
  await finalizarDuelo(io, duelId, vencedorChave, "desistencia");
}
