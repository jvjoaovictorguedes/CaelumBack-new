// Templo do Véu Celestial — bug reportado: "Clico em Enfrentar o
// Guardião e a batalha não inicia." Testado contra o MÓDULO REAL
// (registerTempleBossHandlers), sem subir servidor HTTP/rede de
// verdade — mesmo padrão de criarIoFake/criarSocketFake já usado em
// worldBossDiscovery.test.js ("Ameaça Mundial V2 — Etapa 4: socket
// autenticado"): um Socket real do lado do servidor já é, por
// construção, um EventEmitter, então `.on(evento, handler)` registra
// exatamente como o real e simular "o cliente mandou templeboss:entrar"
// é só chamar `.emit(evento, payload)` no mesmo objeto. O objetivo é
// validar a causa raiz do bug (cliente nunca pode emitir templeboss:*
// antes do IDENTIFY compartilhado terminar — templeBossSocket.js NUNCA
// tem seu próprio handler de identificar, ele só LÊ socket.characterId
// que outro módulo (pvpLiveSocket.js) já deixou setado no mesmo
// socket), nunca reimplementar a lógica de produção.
const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { bancoDisponivel, criarPersonagem, sufixo, sequelize } = require("./helpers/db");
require("../src/models/associations");

const Item = require("../src/models/Item");
const AdventureMonster = require("../src/models/AdventureMonster");
const TempleEvent = require("../src/models/TempleEvent");
const CharacterTempleProgress = require("../src/models/CharacterTempleProgress");
const TempleBossAttempt = require("../src/models/TempleBossAttempt");
const TempleBossConfig = require("../src/models/TempleBossConfig");
const GameSetting = require("../src/models/GameSetting");
const registerTempleBossHandlers = require("../src/socket/templeBossSocket");
const SOCKET_EVENTS = require("../src/contracts/socketEvents");
const { EVENT_STATUS } = require("../src/config/templeConfig");

// templeReleaseService.requireEnabled() (gate adicionado em paralelo
// a esta correção — docs/production-release-controls.md) roda ANTES
// de qualquer outra checagem de entrarOuRetomar; os testes abaixo que
// exercitam essas outras checagens precisam liberar o Templo primeiro
// (mesmo padrão de mock de test/templeRelease.test.js: mocka
// GameSetting.findByPk, nunca a lógica interna do service).
function liberarTemplo() {
  return test.mock.method(GameSetting, "findByPk", async () => ({ valor: true }));
}

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

const itensCriados = [];
const eventosCriados = [];
const monstrosCriados = [];

async function criarItemSigilo() {
  const item = await Item.create({
    nome: `Sigilo Teste ${sufixo()}`,
    descricao: "Sigilo de teste",
    tipo_item: "Currencia",
    raridade: "Epico",
    disponivel_loja: false,
    negociavel_mercado: false,
  });
  itensCriados.push(item.id);
  return item;
}

async function criarMonstroBase(overrides = {}) {
  const monstro = await AdventureMonster.create({
    nome: `Guardião Teste ${sufixo()}`,
    nivel: 50,
    vida_maxima: 1000,
    dano_min: 40,
    dano_max: 60,
    agilidade: 0,
    velocidade: 0,
    defesa: 10,
    ai_profile: "ELITE_BOSS",
    temple_exclusive: true,
    disponivel_emboscada: false,
    ...overrides,
  });
  monstrosCriados.push(monstro.id);
  return monstro;
}

async function criarEventoComBoss({ status = EVENT_STATUS.ACTIVE, semBoss = false } = {}) {
  const itemSigilo = await criarItemSigilo();
  const monstroBase = await criarMonstroBase();
  const evento = await TempleEvent.create({
    key: `convergencia_${sufixo()}`,
    nome: "Vigília do Eclipse",
    status,
    id_currency_item: itemSigilo.id,
    config_snapshot: {
      schema_version: 1,
      nome: "Vigília do Eclipse",
      id_currency_item: itemSigilo.id,
      missions: [],
      relicary: null,
      boss: null,
    },
  });
  eventosCriados.push(evento.id);

  if (!semBoss) {
    const bossConfig = await TempleBossConfig.create({
      id_event: evento.id,
      id_monstro_base: monstroBase.id,
      nome_exibicao: "O Guardião",
      reward_sigils_primeira_vitoria: 10,
    });
    evento.config_snapshot = {
      ...evento.config_snapshot,
      boss: {
        boss_config_id: bossConfig.id,
        id_monstro_base: monstroBase.id,
        nome_exibicao: "O Guardião",
        lore: "Lore de teste",
        imagem_url: null,
        ai_profile: monstroBase.ai_profile,
        base: {
          vida_maxima: monstroBase.vida_maxima,
          dano_min: monstroBase.dano_min,
          dano_max: monstroBase.dano_max,
          defesa: monstroBase.defesa,
          agilidade: 0,
          velocidade: 0,
        },
        scaling: {
          target_turns_to_kill: 8,
          target_boss_actions_survivable: 6,
          scaling_min_multiplier: 0.5,
          scaling_max_multiplier: 3,
        },
        reward_sigils_primeira_vitoria: 10,
        phases: [],
        status_resistances: [],
        abilities: [],
      },
    };
    await evento.save();
  }
  return { evento };
}

async function desbloquearBoss(idEvent, characterId) {
  await CharacterTempleProgress.create({
    id_event: idEvent,
    character_id: characterId,
    boss_unlocked_at: new Date(),
  });
}

test.afterEach(async () => {
  test.mock.restoreAll();
  if (!temBanco) return;
  if (eventosCriados.length > 0) {
    await TempleBossAttempt.destroy({ where: { id_event: eventosCriados } });
    await CharacterTempleProgress.destroy({ where: { id_event: eventosCriados } });
    await TempleEvent.destroy({ where: { id: eventosCriados } });
    eventosCriados.length = 0;
  }
  if (monstrosCriados.length > 0) {
    await AdventureMonster.destroy({ where: { id: monstrosCriados } });
    monstrosCriados.length = 0;
  }
  if (itensCriados.length > 0) {
    await Item.destroy({ where: { id: itensCriados } });
    itensCriados.length = 0;
  }
});

test.after(async () => {
  if (temBanco) await sequelize.close();
});

// --- Fake transport (mesmo padrão de worldBossDiscovery.test.js) -----

function criarIoFake() {
  const listenersDeConexao = [];
  const io = {
    on(evento, callback) {
      if (evento === "connection") listenersDeConexao.push(callback);
    },
    to() {
      return { emit() {} };
    },
  };
  return { io, conectar: (socket) => listenersDeConexao.forEach((cb) => cb(socket)) };
}

function criarSocketFake() {
  const socket = new EventEmitter();
  socket.rooms = new Set();
  socket.join = (sala) => socket.rooms.add(sala);
  socket.leave = (sala) => socket.rooms.delete(sala);
  return socket;
}

// templeboss:entrar/acao nunca usam ack callback — a resposta sempre
// chega como um evento separado (templeboss:estado ou templeboss:erro)
// emitido de volta no MESMO socket (ver comentário do cabeçalho: emit()
// na fake EventEmitter dispara os listeners locais, igual ao real
// socket.io faz pra despachar pacotes). Resolve com o PRIMEIRO dos dois
// que chegar.
function dispararEAguardarRespostaDoGuardiao(socket, evento, payload) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timeout esperando resposta de "${evento}"`)), 2000);
    function limpar() {
      clearTimeout(timeout);
      socket.off(SOCKET_EVENTS.TEMPLEBOSS.ESTADO, onEstado);
      socket.off(SOCKET_EVENTS.TEMPLEBOSS.ERRO, onErro);
    }
    function onEstado(payloadEstado) {
      limpar();
      resolve({ tipo: "estado", payload: payloadEstado });
    }
    function onErro(payloadErro) {
      limpar();
      resolve({ tipo: "erro", payload: payloadErro });
    }
    socket.once(SOCKET_EVENTS.TEMPLEBOSS.ESTADO, onEstado);
    socket.once(SOCKET_EVENTS.TEMPLEBOSS.ERRO, onErro);
    socket.emit(evento, payload);
  });
}

// ---------------------------------------------------------------------
// Causa raiz do bug: socket.characterId precisa estar setado (pelo
// IDENTIFY compartilhado, que templeBossSocket.js nunca implementa
// sozinho) ANTES de templeboss:entrar — nunca basta "socket conectado".
// ---------------------------------------------------------------------

testeComBanco("socket: templeboss:entrar sem se identificar antes é sempre rejeitado (nunca silencioso)", async () => {
  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  const resposta = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(resposta.tipo, "erro");
  assert.match(resposta.payload.mensagem, /identifique/i);
});

testeComBanco("socket: templeboss:entrar com o Templo desativado (kill-switch do GameSetting) rejeita antes de qualquer outra checagem", async () => {
  const { evento } = await criarEventoComBoss();
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await desbloquearBoss(evento.id, personagem.id);
  test.mock.method(GameSetting, "findByPk", async () => ({ valor: false }));

  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);
  socket.characterId = String(personagem.id);

  const resposta = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(resposta.tipo, "erro");
  assert.match(resposta.payload.mensagem, /indisponível/i);
});

testeComBanco("socket: templeboss:entrar identificado (socket.characterId já setado) devolve templeboss:estado", async () => {
  liberarTemplo();
  const { evento } = await criarEventoComBoss();
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await desbloquearBoss(evento.id, personagem.id);

  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);
  // Simula o estado PÓS-ack de SOCKET_EVENTS.TRANSPORT.IDENTIFY — quem
  // seta isso de verdade é pvpLiveSocket.js (handler compartilhado,
  // testado em separado); templeBossSocket.js só LÊ esta propriedade.
  socket.characterId = String(personagem.id);

  const resposta = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(resposta.tipo, "estado");
  assert.ok(resposta.payload.attemptId);
  assert.equal(socket.rooms.has(`templeboss:${personagem.id}`), true);
});

testeComBanco("socket: templeboss:entrar com tentativa Ativa existente faz RESYNC — nunca cria uma segunda tentativa", async () => {
  liberarTemplo();
  const { evento } = await criarEventoComBoss();
  const { personagem } = await criarPersonagem({ nivel: 10 });
  await desbloquearBoss(evento.id, personagem.id);

  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);
  socket.characterId = String(personagem.id);

  const primeira = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(primeira.tipo, "estado");

  // Simula reconexão/F5: um socket NOVO, mas o mesmo characterId
  // (identificado de novo) emitindo templeboss:entrar outra vez.
  const socketNovo = criarSocketFake();
  conectar(socketNovo);
  socketNovo.characterId = String(personagem.id);
  const segunda = await dispararEAguardarRespostaDoGuardiao(socketNovo, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(segunda.tipo, "estado");
  assert.equal(segunda.payload.attemptId, primeira.payload.attemptId, "resync devolve a MESMA tentativa, nunca cria outra");

  const tentativas = await TempleBossAttempt.count({ where: { id_event: evento.id, character_id: personagem.id } });
  assert.equal(tentativas, 1, "nunca mais de 1 tentativa Ativa pro mesmo personagem");
});

testeComBanco("socket: templeboss:entrar sem boss_unlocked_at rejeita com mensagem clara", async () => {
  liberarTemplo();
  const { evento } = await criarEventoComBoss();
  const { personagem } = await criarPersonagem({ nivel: 10 });
  // nunca chama desbloquearBoss — personagem não tem o Guardião liberado.

  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);
  socket.characterId = String(personagem.id);

  const resposta = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(resposta.tipo, "erro");
  assert.match(resposta.payload.mensagem, /desbloqueou/i);
  void evento;
});

testeComBanco("socket: templeboss:entrar sem nenhuma Convergência ativa rejeita com mensagem clara", async () => {
  liberarTemplo();
  const { personagem } = await criarPersonagem({ nivel: 10 });
  // nenhum criarEventoComBoss() chamado — não existe TempleEvent
  // ACTIVE/RELICARY_ONLY nenhum. Gate diferente do kill-switch de
  // templeReleaseService (liberado aqui): este é o "não há nenhuma
  // Convergência rodando agora" (ver templeBossAttemptService.
  // obterEventoComGuardiao/EVENT_STATUS_ABERTOS).

  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);
  socket.characterId = String(personagem.id);

  const resposta = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(resposta.tipo, "erro");
  assert.match(resposta.payload.mensagem, /convergência/i);
});

testeComBanco("socket: templeboss:entrar com Convergência sem Guardião configurado rejeita com mensagem clara", async () => {
  liberarTemplo();
  await criarEventoComBoss({ semBoss: true });
  const { personagem } = await criarPersonagem({ nivel: 10 });

  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);
  socket.characterId = String(personagem.id);

  const resposta = await dispararEAguardarRespostaDoGuardiao(socket, SOCKET_EVENTS.TEMPLEBOSS.ENTRAR);
  assert.equal(resposta.tipo, "erro");
  assert.match(resposta.payload.mensagem, /configurado/i);
});

testeComBanco("socket: templeboss:acao sem se identificar antes nunca processa (char não setado, sem resposta nenhuma)", async () => {
  const { io, conectar } = criarIoFake();
  registerTempleBossHandlers(io);
  const socket = criarSocketFake();
  conectar(socket);

  // ACAO sem characterId retorna cedo (void) — nunca emite ESTADO nem
  // ERRO (diferente de ENTRAR, que sempre responde algo). Provamos isso
  // dando um tempo curto pra garantir que NENHUM dos dois chegou —
  // nunca silenciosamente "funciona" sem personagem identificado.
  let recebeuAlgo = false;
  socket.once(SOCKET_EVENTS.TEMPLEBOSS.ESTADO, () => {
    recebeuAlgo = true;
  });
  socket.once(SOCKET_EVENTS.TEMPLEBOSS.ERRO, () => {
    recebeuAlgo = true;
  });
  socket.emit(SOCKET_EVENTS.TEMPLEBOSS.ACAO, { tipo: "attack" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(recebeuAlgo, false);
});
