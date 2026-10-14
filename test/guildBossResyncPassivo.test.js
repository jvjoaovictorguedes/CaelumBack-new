// Bug real reportado ("boss ainda bugado... não é pq ele já tava
// ativo?"): o ÚNICO resync pós-F5/reconexão do Boss da Guilda era o
// FRONTEND chamar guildboss:entrar sozinho sempre que a tentativa da
// GUILDA estivesse "Ativo" — mesmo pra quem nunca tinha entrado na
// luta. Esse evento não é neutro: checa cooldown de 20min e, se não
// achar uma luta pra resync, ABRE uma nova sozinho (ver
// guildBossSocket.js). Resultado: só de abrir a aba do Boss da Guilda
// enquanto QUALQUER outro membro estava lutando, o jogador era
// silenciosamente colocado na luta (ou levava um erro de cooldown) sem
// ter clicado em nada.
//
// Fix: resync agora é PASSIVO (registrarAoIdentificar, mesmo padrão do
// convite pendente de partySocket.js) — só reage se o personagem JÁ
// está numa luta de verdade, nunca cria nem entra em nada por conta
// própria. Testado contra os módulos REAIS (registerPvpLiveHandlers +
// registerGuildBossHandlers na mesma io fake), nunca reimplementando a
// lógica de produção — mesmo padrão de templeBossSocket.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
const GuildBossConfig = require("../src/models/GuildBossConfig");
const GuildBossAttempt = require("../src/models/GuildBossAttempt");

const SOCKET_EVENTS = require("../src/contracts/socketEvents");
const { emitirTicket } = require("../src/services/socketTicketService");
const registerPvpLiveHandlers = require("../src/socket/pvpLiveSocket");
const registerGuildBossHandlers = require("../src/socket/guildBossSocket");

let temBanco = false;
test.before(async () => {
  temBanco = await bancoDisponivel();
});

function testeComBanco(nome, fn) {
  test(nome, async (t) => {
    if (!temBanco) return t.skip("sem banco de dados (defina TEST_DATABASE_URL)");
    return fn(t);
  });
}

test.after(async () => {
  if (temBanco) await sequelize.close();
});

function criarIoFake() {
  const listenersDeConexao = [];
  const todosOsSockets = new Set();
  const io = {
    on(evento, callback) {
      if (evento === "connection") listenersDeConexao.push(callback);
    },
    sockets: { sockets: new Map() },
    // criarBatalha() devolve o estado de abertura via `io.to(sala).emit(...)`
    // (nunca um emit direto no socket que entrou) — um stub que descarta o
    // emit faria QUALQUER teste de abertura de luta "nunca chegar", mesmo
    // com a produção funcionando perfeitamente. Broadcast de verdade pra
    // todo socket fake que já deu `.join(sala)`.
    to(sala) {
      return {
        emit(evento, payload) {
          for (const socket of todosOsSockets) {
            if (socket.rooms.has(sala)) socket.emit(evento, payload);
          }
        },
      };
    },
  };
  return {
    io,
    conectar: (socket) => {
      todosOsSockets.add(socket);
      listenersDeConexao.forEach((cb) => cb(socket));
    },
  };
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

async function identificar(socket, usuario) {
  const ticket = emitirTicket(usuario.id);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("ack de identificar nunca chamado")), 2000);
    socket.emit(SOCKET_EVENTS.TRANSPORT.IDENTIFY, { ticket }, () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

let contadorRank = 0;

async function criarGuildaComBossAtivo() {
  contadorRank += 1;
  const { usuario, personagem } = await criarPersonagem({ nivel: 10 });
  const sigla = Math.random().toString(36).slice(2, 7).toUpperCase();
  const guild = await Guild.create({
    nome: `Guilda ${personagem.id}`,
    sigla,
    id_fundador: personagem.id,
    id_lider: personagem.id,
  });
  await GuildMember.create({ id_guild: guild.id, id_personagem: personagem.id, cargo: "Fundador" });

  const chefe = await GuildBossConfig.create({
    rank: `Z${process.pid % 1000}${contadorRank}`.slice(0, 10),
    nome_chefe: `Chefe Teste ${sufixo()}`,
    descricao: "teste",
    vida_total: 10000,
    janela_horas: 24,
    dano_base_ataque: 10,
  });

  await GuildBossAttempt.create({
    id_guild: guild.id,
    id_guild_boss_config: chefe.id,
    rank: guild.rank,
    vida_total: 10000,
    vida_restante: 10000,
    semana_inicio: new Date(),
    expira_em: new Date(Date.now() + 24 * 3600 * 1000),
    status: "Ativo",
  });

  return { usuario, personagem, guild };
}

testeComBanco(
  "identificar NUNCA entra sozinho na luta pra quem ainda não atacou (mesmo com a tentativa da guilda Ativo)",
  async () => {
    const { usuario } = await criarGuildaComBossAtivo();

    const { io, conectar } = criarIoFake();
    registerPvpLiveHandlers(io);
    registerGuildBossHandlers(io);
    const socket = criarSocketFake();
    conectar(socket);

    let recebeuAlgoDoGuildBoss = false;
    socket.on(SOCKET_EVENTS.GUILDBOSS.ESTADO, () => { recebeuAlgoDoGuildBoss = true; });
    socket.on(SOCKET_EVENTS.GUILDBOSS.ERRO, () => { recebeuAlgoDoGuildBoss = true; });
    socket.on(SOCKET_EVENTS.GUILDBOSS.BATALHA_INICIADA, () => { recebeuAlgoDoGuildBoss = true; });

    await identificar(socket, usuario);
    // Dá tempo de qualquer efeito colateral indevido (abrir luta sozinho,
    // erro de cooldown) acontecer, se o bug ainda existisse.
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(
      recebeuAlgoDoGuildBoss,
      false,
      "só identificar (sem nunca ter clicado em 'Atacar o Boss') não pode emitir nada do Boss da Guilda",
    );
  },
);

testeComBanco(
  "identificar de novo (F5/reconexão) RESSINCRONIZA quem já estava na luta, sem precisar chamar entrar() de novo",
  async () => {
    const { usuario, guild } = await criarGuildaComBossAtivo();

    const { io, conectar } = criarIoFake();
    registerPvpLiveHandlers(io);
    registerGuildBossHandlers(io);

    // Primeira conexão: entra na luta de verdade (clique manual).
    const socket1 = criarSocketFake();
    conectar(socket1);
    await identificar(socket1, usuario);
    const batalhaIniciada = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("batalha-iniciada nunca chegou")), 8000);
      socket1.once(SOCKET_EVENTS.GUILDBOSS.BATALHA_INICIADA, (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
      socket1.once(SOCKET_EVENTS.GUILDBOSS.ERRO, (payload) => {
        clearTimeout(timeout);
        reject(new Error(`guildboss:erro = ${JSON.stringify(payload)}`));
      });
      socket1.emit(SOCKET_EVENTS.GUILDBOSS.ENTRAR);
    });
    assert.ok(batalhaIniciada.battleId);

    // Reconexão: socket NOVO, mesmo personagem — nunca emite
    // guildboss:entrar, só se identifica de novo (exatamente o que
    // useCombatTransport.ts faz sozinho a cada connect).
    const socket2 = criarSocketFake();
    conectar(socket2);
    const estadoResync = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("resync passivo nunca chegou")), 8000);
      socket2.once(SOCKET_EVENTS.GUILDBOSS.ESTADO, (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
      identificar(socket2, usuario).catch(reject);
    });

    assert.equal(estadoResync.battleId, batalhaIniciada.battleId, "resync devolve a MESMA luta, nunca cria outra");
    assert.equal(estadoResync.vidaAtual, batalhaIniciada.vidaAtual);
    void guild;
  },
);
