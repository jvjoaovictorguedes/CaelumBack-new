// Bug real reportado pelo jogador: "Não foi possível entrar na luta do
// Boss." mesmo com a tentativa da guilda ativa e sem cooldown. Causa
// encontrada ao ler criarBatalha() em guildBossSocket.js: a tipagem
// elemental do chefe (combatTypingService.catalog()/monsterProfile,
// feature nova de Afinidades de Combate) e as habilidades do chefe
// (monsterCombatAdapter.construirHabilidadesParaGuildBoss) eram
// carregadas SEM try/catch dentro de criarBatalha — qualquer falha
// nessas consultas (ex.: dado incompleto da config do chefe) derrubava
// a entrada inteira pro catch genérico do handler GUILDBOSS.ENTRAR,
// mesmo o jogador não tendo feito nada de errado. Essas duas coisas são
// só bônus/penalidade de DANO em cima do combate normal — nunca um
// requisito pra entrar na luta (mesmo espírito já documentado no código:
// "boss sem nenhuma ability ativa = comportamento 100% legado").
//
// Fix: cada uma agora tem o próprio try/catch com fallback seguro
// (combatTyping=null, habilidadesChefe=[]) — uma falha ali vira só um
// log de aviso, nunca impede o BATALHA_INICIADA. Testado forçando a
// MESMA falha (catalog() rejeitando) contra o módulo real de produção,
// nunca reimplementando a lógica no teste (mesmo padrão de
// guildBossResyncPassivo.test.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { bancoDisponivel, criarPersonagem, sufixo } = require("./helpers/db");
const { sequelize } = require("../src/config/database");
require("../src/models/associations");

const Guild = require("../src/models/Guild");
const GuildMember = require("../src/models/GuildMember");
const GuildBossConfig = require("../src/models/GuildBossConfig");
const GuildBossAttempt = require("../src/models/GuildBossAttempt");

const SOCKET_EVENTS = require("../src/contracts/socketEvents");
const { emitirTicket } = require("../src/services/socketTicketService");
const registerPvpLiveHandlers = require("../src/socket/pvpLiveSocket");
const registerGuildBossHandlers = require("../src/socket/guildBossSocket");
const combatTypingModels = require("../src/models/combatTypingModels");

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
    rank: `R${process.pid % 1000}${contadorRank}`.slice(0, 10),
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
  "falha na tipagem elemental do chefe (combatTypingService.catalog) NÃO impede entrar na luta",
  async (t) => {
    const { usuario } = await criarGuildaComBossAtivo();

    // Força exatamente o tipo de falha que derrubava a entrada inteira
    // antes do fix: uma das tabelas do catálogo de tipagem rejeitando.
    const original = combatTypingModels.DamageAffinityType.findAll;
    combatTypingModels.DamageAffinityType.findAll = () =>
      Promise.reject(new Error("falha simulada no catálogo de tipagem"));
    t.after(() => {
      combatTypingModels.DamageAffinityType.findAll = original;
    });

    const { io, conectar } = criarIoFake();
    registerPvpLiveHandlers(io);
    registerGuildBossHandlers(io);
    const socket = criarSocketFake();
    conectar(socket);
    await identificar(socket, usuario);

    const resultado = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("nem batalha-iniciada nem erro chegou")), 8000);
      socket.once(SOCKET_EVENTS.GUILDBOSS.BATALHA_INICIADA, (payload) => {
        clearTimeout(timeout);
        resolve({ tipo: "iniciada", payload });
      });
      socket.once(SOCKET_EVENTS.GUILDBOSS.ERRO, (payload) => {
        clearTimeout(timeout);
        resolve({ tipo: "erro", payload });
      });
      socket.emit(SOCKET_EVENTS.GUILDBOSS.ENTRAR);
    });

    assert.equal(
      resultado.tipo,
      "iniciada",
      `esperava entrar na luta mesmo com a tipagem elemental falhando, mas recebeu: ${JSON.stringify(resultado.payload)}`,
    );
    assert.ok(resultado.payload.battleId);
  },
);
