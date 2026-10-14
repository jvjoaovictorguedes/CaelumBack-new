// Bug real reportado pelo WhatsApp: Boss da Guilda e Ranqueado ficavam
// "conectando aos servidores..." pra sempre, botão sem clicar. Causa
// raiz: o ticket de curtíssima duração (30s, socketTicketService) podia
// expirar entre o cliente buscar ele e o servidor processar
// identificar (TRANSPORT.IDENTIFY) — numa rede lenta isso não é raro.
// Quando isso acontecia, o handler respondia com um evento de erro mas
// NUNCA chamava o ack, então o cliente (useCombatTransport.ts) ficava
// esperando um callback que nunca chegava, sem nenhuma tentativa nova.
// Mesmo padrão criarIoFake/criarSocketFake de templeBossSocket.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const Character = require("../src/models/Character");
const { emitirTicket } = require("../src/services/socketTicketService");
const SOCKET_EVENTS = require("../src/contracts/socketEvents");
const registerPvpLiveHandlers = require("../src/socket/pvpLiveSocket");

function criarIoFake() {
  const listenersDeConexao = [];
  const io = {
    on(evento, callback) {
      if (evento === "connection") listenersDeConexao.push(callback);
    },
    sockets: { sockets: new Map() },
  };
  return { io, conectar: (socket) => listenersDeConexao.forEach((cb) => cb(socket)) };
}

function criarSocketFake() {
  const socket = new EventEmitter();
  socket.id = `socket-${Math.random().toString(36).slice(2)}`;
  socket.rooms = new Set();
  socket.join = (sala) => socket.rooms.add(sala);
  socket.leave = (sala) => socket.rooms.delete(sala);
  socket.broadcast = { emit() {} };
  return socket;
}

test.afterEach(() => {
  test.mock.restoreAll();
});

test("socket: identificar com ticket inválido/expirado chama o ack com erro (nunca deixa o cliente sem resposta)", async () => {
  const { io, conectar } = criarIoFake();
  registerPvpLiveHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  // Ticket mal-formado reproduz exatamente o que jwt.verify faz com um
  // ticket expirado (lança, personagemViaTicket captura e retorna null)
  // — sem precisar mockar nada da verificação.
  const erroEmitido = await new Promise((resolve) => {
    socket.once(SOCKET_EVENTS.PVP.ERRO, resolve);
    socket.emit(SOCKET_EVENTS.TRANSPORT.IDENTIFY, { ticket: "ticket-expirado-ou-invalido" }, () => {});
  });
  assert.match(erroEmitido.mensagem, /inválido|expirado/i);

  const resposta = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ack nunca chamado")), 500);
    socket.emit(SOCKET_EVENTS.TRANSPORT.IDENTIFY, { ticket: "ticket-expirado-ou-invalido" }, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
  assert.equal(resposta?.erro, "TICKET_INVALIDO");
  assert.equal(socket.characterId, undefined, "nunca seta characterId quando o ticket falha");
});

test("socket: identificar com ticket válido seta characterId e chama o ack sem erro", async () => {
  test.mock.method(Character, "findOne", async () => ({ id: 42 }));

  const { io, conectar } = criarIoFake();
  registerPvpLiveHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const ticket = emitirTicket(7);
  const resposta = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ack nunca chamado")), 500);
    socket.emit(SOCKET_EVENTS.TRANSPORT.IDENTIFY, { ticket }, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
  assert.equal(resposta, undefined, "ack de sucesso não carrega erro nenhum");
  assert.equal(socket.characterId, "42");
});
