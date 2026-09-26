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

const crypto = require("crypto");
const Character = require("../models/Character");
const Class = require("../models/Class");
const CharacterInventory = require("../models/CharacterInventory");
const Item = require("../models/Item");
const ConsumableProperties = require("../models/ConsumableProperties");
const WeaponStatusEffect = require("../models/WeaponStatusEffect");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
  custoManaEfetivo,
} = require("../services/combatFormulas");
const { resolverTurnoComStatus } = require("../services/duelEngine");
const { buscarPoderesDoPersonagem, aplicarResultadoDuelo } = require("../controllers/pvpController");
const { listarConsumiveisDeCombate } = require("../services/combatConsumablesService");
const {
  buscarBonusDeAtributos,
  personagemComBonus,
} = require("../services/equipmentBonusService");
const { personagemViaTicket } = require("./socketAuth");
const uniquePowerEffectRegistry = require("../services/uniquePowerEffectRegistry");
const {
  verificarCooldownDesafiante,
  verificarAntifarmPar,
} = require("../services/pvpAntifarmService");

const NOME_ARENA = "Arena de Caelum";
const PRAZO_ACEITAR_MS = 20000;
const PRAZO_TURNO_MS = 5000;
const MAX_ACOES = 80;

// characterId (string) -> socket.id
const online = new Map();
// Callbacks chamados toda vez que um socket se identifica (login inicial
// ou reconexão — refresh de página, aba nova, queda de rede). Outros
// módulos usam `registrarAoIdentificar` pra ressincronizar estado
// pendente (ex.: convite de party) com o socket novo, já que um
// characterId pode trocar de socket.id a qualquer momento e nada
// reenviava automaticamente o que já tinha sido emitido pro socket
// antigo.
const aoIdentificarCallbacks = [];
function registrarAoIdentificar(callback) {
  aoIdentificarCallbacks.push(callback);
}
// characterId do desafiado (string) -> { idDesafiante, socketIdDesafiante, timeoutHandle }
const desafiosPendentes = new Map();
// characterId do desafiante (string) -> characterId do desafiado (string)
// Antes só o lado que RECEBE um desafio era limitado a um por vez
// (desafiosPendentes, chaveado pelo alvo) — nada impedia um único
// personagem de desafiar vários alvos diferentes ao mesmo tempo. Esse
// mapa espelha o mesmo desafio pelo lado do desafiante, então dá pra
// rejeitar um segundo "pvp:desafiar" enquanto o primeiro ainda não foi
// respondido/expirado.
const desafiosEnviadosPor = new Map();
// duelId -> duelo
const duelos = new Map();
// characterId (string) -> duelId
const duelPorPersonagem = new Map();

let proximoDuelId = 1;

// Exportado pra rankedLiveSocket.js poder alocar duelIds no MESMO
// espaço de contagem, sem duplicar o contador (§ integração ranked).
function alocarDuelId() {
  return proximoDuelId++;
}

function chaveOnline(id) {
  return String(id);
}

// `vidaCheia` (default true) faz todo mundo entrar em combate com
// vida/mana no máximo — correto pra Duelo/Ranqueado/Torneio (é uma
// disputa formal isolada, não deveria herdar dano de outra coisa).
// Batalha de Party passa `{ vidaCheia: false }` porque ali o
// personagem tem que entrar com a vida REAL que já estava (bug
// reportado: grupo curava geral de graça ao iniciar a aventura).
// Sistema de Proezas Únicas §11 — `contexto` decide quais Powers
// UNIQUE_FEAT sobrevivem no loadout deste lutador. Default "PVP_CASUAL"
// (o uso mais comum desta função é o duelo ao vivo casual); cada
// chamador que representa outro contexto real (ranked/torneio/party/
// guild boss) passa o seu — nunca confiar no default fora do duelo
// casual.
async function carregarLutador(characterId, { vidaCheia = true, contexto = "PVP_CASUAL" } = {}) {
  const personagem = await Character.findByPk(characterId, { include: [{ model: Class }] });
  if (!personagem) return null;
  const poderesCarregados = await buscarPoderesDoPersonagem(characterId);
  const idsDesautorizados = await uniquePowerEffectRegistry.idsDesautorizadosNoContexto(poderesCarregados, contexto);
  // §11 — nunca deixa o Power "entrar" só pra não fazer efeito: some do
  // loadout inteiro pra este lutador, igual se o jogador nunca tivesse
  // aprendido nele. O frontend mostra o aviso "Legado desabilitado
  // neste modo" só como UX; a segurança real é sempre este filtro aqui.
  const poderes =
    idsDesautorizados.length > 0 ? poderesCarregados.filter((p) => !idsDesautorizados.includes(p.id)) : poderesCarregados;
  const consumiveis = await listarConsumiveisDeCombate(characterId);
  const bonus = await buscarBonusDeAtributos(characterId);
  const base = comMultiplicadoresDeClasse(
    personagemComBonus(personagem.toJSON(), bonus),
    personagem.Class,
  );
  const vidaMax = vidaMaximaDe(base);
  const manaMax = manaMaximaDe(base);

  // Motor de Status §32 (Performance) — mesmo princípio do PvE: captura
  // os efeitos de status da arma equipada UMA vez, no início do duelo,
  // pra executarTurno nunca consultar o banco a cada hit.
  const efeitosDaArmaEquipada = base.arma_equipada?.id_item
    ? await WeaponStatusEffect.findAll({ where: { id_item: base.arma_equipada.id_item, ativo: true } })
    : [];

  return {
    id: base.id,
    nome: base.nome,
    genero: base.genero,
    classe: personagem.Class?.nome,
    poderes,
    consumiveis,
    armaEfeitos: efeitosDaArmaEquipada.map((e) => ({
      status_key: e.status_key,
      chance_ppm: e.chance_ppm,
      duration_turns: e.duration_turns,
      potency_base: e.potency_base,
      potency_scale_attribute: e.potency_scale_attribute,
      potency_scale_value: e.potency_scale_value,
      trigger: e.trigger,
      ativo: e.ativo,
    })),
    estado: {
      ...base,
      vida_atual: vidaCheia ? vidaMax : Math.max(0, Math.min(base.vida_atual ?? vidaMax, vidaMax)),
      mana_atual: vidaCheia ? manaMax : Math.max(0, Math.min(base.mana_atual ?? manaMax, manaMax)),
    },
    vidaMax,
    manaMax,
  };
}

function limparDesafioPendente(desafiadoId) {
  const chave = chaveOnline(desafiadoId);
  const pendente = desafiosPendentes.get(chave);
  if (pendente) {
    clearTimeout(pendente.timeoutHandle);
    desafiosPendentes.delete(chave);
    if (desafiosEnviadosPor.get(pendente.idDesafiante) === chave) {
      desafiosEnviadosPor.delete(pendente.idDesafiante);
    }
  }
}

function poderesPublicos(poderes) {
  return poderes.map((p) => ({
    id: p.id,
    nome: p.nome,
    imagem_url: p.imagem_url ?? null,
    custo_mana: custoManaEfetivo(p, p.nivel_habilidade ?? 1),
    dano_base: p.dano_base,
    cura_base: p.cura_base,
    nivel_habilidade: p.nivel_habilidade ?? 1,
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

      // Arena Ranqueada (§9 — reconexão): se esse personagem estava numa
      // partida ranqueada em andamento com uma janela de reconexão aberta
      // (aoReconectar setado pelo rankedLiveSocket.js na criação do
      // duelo), avisa o hook pra cancelar o timer de abandono e
      // ressincronizar o estado com este socket novo. Duelos casuais nunca
      // setam `aoReconectar`, então isso é um no-op pra eles.
      const duelIdAtivo = duelPorPersonagem.get(chave);
      if (duelIdAtivo) {
        const duelo = duelos.get(duelIdAtivo);
        duelo?.aoReconectar?.(io, socket, duelIdAtivo);
      }

      // Outros módulos (ex.: partySocket.js — convite de party pendente)
      // se inscrevem aqui via registrarAoIdentificar pra ressincronizar
      // estado com o socket novo. Callback por módulo, não por duelo
      // (diferente do aoReconectar acima), porque não há "um objeto"
      // pra pendurar a função — é um evento genérico de "esta conexão é
      // este personagem agora".
      for (const callback of aoIdentificarCallbacks) {
        callback(io, socket, chave);
      }
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
      if (desafiosEnviadosPor.has(idDesafiante)) {
        return socket.emit("pvp:erro", {
          mensagem: "Você já tem um desafio pendente. Aguarde ele ser respondido ou expirar.",
        });
      }

      // Mesmas regras de cooldown/antifarm do duelo assíncrono — o duelo
      // ao vivo usava o mesmo aplicarResultadoDuelo (e portanto o mesmo
      // PvpStatus.ultima_batalha_dia) mas nunca checava nada disso antes
      // de deixar o duelo começar, então dava pra viver inteiramente fora
      // do cooldown/antifarm só usando o modo ao vivo.
      const erroCooldown = await verificarCooldownDesafiante(idDesafiante);
      if (erroCooldown) {
        return socket.emit("pvp:erro", { mensagem: erroCooldown });
      }
      const erroAntifarmPar = await verificarAntifarmPar(idDesafiante, idDesafiado);
      if (erroAntifarmPar) {
        return socket.emit("pvp:erro", { mensagem: erroAntifarmPar });
      }

      // PvP v2 §16 — exclusão mútua: personagem com série de torneio
      // ativa (ready check ou em andamento) não entra em duelo casual.
      // require() tardio pelo mesmo motivo do `estaOnline` acima: o
      // service de torneio carrega models que, no topo, criariam ciclo.
      const { emSerieAtiva } = require("../services/tournamentService");
      for (const id of [idDesafiante, idDesafiado]) {
        if (await emSerieAtiva(id)) {
          return socket.emit("pvp:erro", {
            mensagem: "Um dos dois está em uma série de torneio agora.",
          });
        }
      }

      const desafiante = await Character.findByPk(idDesafiante);
      if (!desafiante) {
        return socket.emit("pvp:erro", { mensagem: "Personagem desafiante não encontrado." });
      }

      const socketIdDesafiado = online.get(chaveOnline(idDesafiado));
      const timeoutHandle = setTimeout(() => {
        limparDesafioPendente(idDesafiado);
        socket.emit("pvp:desafio-expirado", { idDesafiado });
        io.to(socketIdDesafiado).emit("pvp:desafio-cancelado", { idDesafiante });
      }, PRAZO_ACEITAR_MS);

      desafiosPendentes.set(chaveOnline(idDesafiado), {
        idDesafiante,
        socketIdDesafiante: socket.id,
        timeoutHandle,
      });
      desafiosEnviadosPor.set(idDesafiante, chaveOnline(idDesafiado));

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
          danoTotalA: 0,
          danoTotalB: 0,
          statusEffects: { A: [], B: [] },
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
          consumiveisA: lutadorA.consumiveis,
          consumiveisB: lutadorB.consumiveis,
          turnoDe: primeiro,
          prazoSegundos: PRAZO_TURNO_MS / 1000,
        });

        iniciarTimerDeTurno(io, duelId);
      } catch (error) {
        console.error("Erro ao iniciar duelo ao vivo:", error);
        socket.emit("pvp:erro", { mensagem: "Não foi possível iniciar o duelo." });
      }
    });

    socket.on("pvp:acao", async ({ tipo, idPoder, idItem } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const duelId = duelPorPersonagem.get(characterId);
      if (!duelId) return socket.emit("pvp:erro", { mensagem: "Você não está em nenhum duelo." });

      const duelo = duelos.get(duelId);
      if (!duelo) return;

      // Só o item consulta o banco (async) — attack/power resolvem tudo
      // em memória e não têm gap nenhum pra correr risco de corrida.
      // Ainda assim, essa trava cobre os três tipos: evita que um duplo
      // clique durante o await do item dispare uma segunda ação (de
      // qualquer tipo) antes da primeira terminar de processar.
      if (duelo.processandoAcao) {
        return socket.emit("pvp:erro", { mensagem: "Aguarde, sua última ação ainda está sendo processada." });
      }

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
        // buscarPoderesDoPersonagem só filtra is_active — todo poder
        // Passivo concedido nasce com is_active:true (e nem pode ser
        // desativado, ver characterAbilitiesController.toggleCharacterAbility),
        // então sem essa checagem qualquer poder passivo aprendido dava
        // pra ser escolhido como ação de turno aqui, igual um poder
        // ativo de verdade — coisa que o combate PvE já barra
        // explicitamente (ver combatController.js) mas o PvP ao vivo
        // nunca chegou a checar.
        if (power.tipo_poder !== "Ativo") {
          return socket.emit("pvp:erro", { mensagem: "Este poder não pode ser usado manualmente em combate." });
        }
        if (custoManaEfetivo(power, power.nivel_habilidade ?? 1) > lutadorAtacante.estado.mana_atual) {
          return socket.emit("pvp:erro", { mensagem: "Mana insuficiente para esse poder." });
        }
        acao = { tipo: "power", power };
      } else if (tipo === "item") {
        // PvP v2 §10 — consumíveis são DESABILITADOS na Arena
        // Ranqueada (e só nela: casual e torneio continuam liberados).
        // Barrado aqui, no único ponto por onde uma ação de item entra,
        // em vez de espalhar a checagem por quem monta o duelo.
        if (duelo.ranked) {
          return socket.emit("pvp:erro", {
            mensagem: "Consumíveis não podem ser usados na Arena Ranqueada.",
          });
        }
        // Consumível como ação de duelo — mesma regra de "gasta o turno
        // inteiro" e o mesmo caminho de validação (inventário + tipo do
        // item + efeito configurado) já usado no PvE (combatController.js).
        // Precisa de consulta ao banco (await), então trava o duelo pra
        // ninguém mandar uma segunda ação enquanto essa resolve.
        duelo.processandoAcao = true;
        try {
          const inventoryEntry = await CharacterInventory.findOne({
            where: { id_personagem: characterId, id_item: idItem },
          });
          if (!inventoryEntry || inventoryEntry.quantidade < 1) {
            return socket.emit("pvp:erro", { mensagem: "Você não possui esse item no inventário." });
          }

          const item = await Item.findByPk(idItem);
          if (!item || item.tipo_item !== "Consumivel") {
            return socket.emit("pvp:erro", { mensagem: "Este item não pode ser usado em combate." });
          }

          const efeito = await ConsumableProperties.findByPk(idItem);
          if (!efeito) {
            return socket.emit("pvp:erro", { mensagem: "Este item não possui efeito configurado." });
          }

          // Reconfirma que o duelo/turno continuam válidos depois do
          // await acima — o timer de turno (ataque automático por tempo
          // esgotado) pode ter disparado enquanto a consulta rodava.
          const dueloAtual = duelos.get(duelId);
          if (!dueloAtual || dueloAtual.turnoDe !== chave) {
            return socket.emit("pvp:erro", { mensagem: "Esse turno não é mais válido." });
          }

          inventoryEntry.quantidade -= 1;
          if (inventoryEntry.quantidade <= 0) {
            await inventoryEntry.destroy();
          } else {
            await inventoryEntry.save();
          }

          acao = { tipo: "item", item, efeito };
        } catch (error) {
          console.error("Erro ao usar item em duelo ao vivo:", error);
          return socket.emit("pvp:erro", { mensagem: "Não foi possível usar esse item agora." });
        } finally {
          duelo.processandoAcao = false;
        }
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
      for (const [idDesafiado, pendente] of Array.from(desafiosPendentes.entries())) {
        if (pendente.idDesafiante === characterId) {
          limparDesafioPendente(idDesafiado);
          const socketIdDesafiado = online.get(idDesafiado);
          if (socketIdDesafiado) {
            io.to(socketIdDesafiado).emit("pvp:desafio-cancelado", { idDesafiante: characterId });
          }
        }
      }

      const duelId = duelPorPersonagem.get(characterId);
      if (duelId) {
        // Arena Ranqueada tem janela de reconexão própria (§9) — quando o
        // duelo é ranked (aoDesconectar setado pelo rankedLiveSocket.js),
        // a desistência imediata do duelo casual não se aplica.
        const duelo = duelos.get(duelId);
        if (duelo?.aoDesconectar) {
          duelo.aoDesconectar(io, duelId, characterId);
        } else {
          finalizarDueloPorDesistencia(io, duelId, characterId);
        }
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

async function executarTurno(io, duelId, chave, acao, foiAutomatico = false) {
  const duelo = duelos.get(duelId);
  if (!duelo) return;
  clearTimeout(duelo.timer);

  const outraChave = chave === "A" ? "B" : "A";
  const atacanteInfo = chave === "A" ? duelo.a : duelo.b;
  const defensorInfo = chave === "A" ? duelo.b : duelo.a;
  const vidaMaxAtacante = chave === "A" ? duelo.a.vidaMax : duelo.b.vidaMax;
  const manaMaxAtacante = chave === "A" ? duelo.a.manaMax : duelo.b.manaMax;

  duelo.acoes += 1;

  // Motor de Status (Evolução do Motor de Status) — mesma engrenagem do
  // PvE (combatController.js), agora também no duelo ao vivo (casual,
  // ranqueado e torneio, que reaproveitam esta mesma função): ticks de
  // DoT no início do turno do atacante, bloqueio de ação por controle
  // duro, Enfraquecimento/Cegueira, proc de arma/poder no alvo. `turno`
  // reaproveita duelo.acoes (já monotônico e único por chamada) — não
  // precisa de outro contador só pra dedupe de rolagem de Paralyze.
  const {
    nomeAcao,
    dano,
    cura,
    manaCurada,
    esquivou,
    morteAntesDeAgir,
    bloqueado,
    statusAtacante,
    statusDefensor,
    log: logStatus,
  } = await resolverTurnoComStatus({
    atacante: atacanteInfo.estado,
    defensor: defensorInfo.estado,
    acao,
    vidaMaxAtacante,
    manaMaxAtacante,
    statusAtacante: duelo.statusEffects[chave],
    statusDefensor: duelo.statusEffects[outraChave],
    turno: duelo.acoes,
    casterActorId: chave,
    armaEfeitosAtacante: atacanteInfo.armaEfeitos,
    itemIdArmaAtacante: atacanteInfo.estado.arma_equipada?.id_item ?? null,
    nomeAtacante: atacanteInfo.nome,
    nomeDefensor: defensorInfo.nome,
  });
  duelo.statusEffects[chave] = statusAtacante;
  duelo.statusEffects[outraChave] = statusDefensor;

  if (dano > 0) {
    if (chave === "A") duelo.danoTotalA += dano;
    else duelo.danoTotalB += dano;
  }

  const payloadTurno = {
    duelId,
    atacante: chave,
    nomeAcao: bloqueado || morteAntesDeAgir ? nomeAcao : foiAutomatico ? `${nomeAcao} (tempo esgotado)` : nomeAcao,
    dano,
    cura,
    manaCurada,
    esquivou,
    bloqueado: Boolean(bloqueado),
    logStatus,
    statusA: duelo.statusEffects.A.map((s) => ({ key: s.key, remainingTurns: s.remainingTurns, stacks: s.stacks })),
    statusB: duelo.statusEffects.B.map((s) => ({ key: s.key, remainingTurns: s.remainingTurns, stacks: s.stacks })),
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
  };

  // DoT pode matar o próprio atacante antes de ele conseguir agir
  // (§23 passo 2 do PvE, mesmo caso aqui) — quem "venceu" nesse caso é
  // sempre o defensor, sem entrar na lógica normal de "quem causou
  // dano nesta ação" (não houve ação nenhuma).
  const acabouPorAutoDerrota = morteAntesDeAgir && atacanteInfo.estado.vida_atual <= 0;
  const acabou = acabouPorAutoDerrota || defensorInfo.estado.vida_atual <= 0 || duelo.acoes >= MAX_ACOES;

  if (acabou) {
    let vencedorChave;
    if (acabouPorAutoDerrota) {
      vencedorChave = outraChave;
    } else if (defensorInfo.estado.vida_atual <= 0) {
      vencedorChave = chave;
    } else {
      // Bug real reportado: duelo batia no limite de 80 ações e quem só
      // ficou curando (nunca chegou perto de derrubar o oponente)
      // ganhava só por estar com % de vida maior — "o inimigo ganhou
      // usando vida". Critério agora é quem causou mais dano de
      // verdade na luta (dano não sofre a mitigação de defesa que a
      // cura nunca teve, então é a medida real de quem "venceu" o
      // combate); % de vida vira só desempate de dano total igual, e
      // sorteio só no empate completo — mesmo cuidado do PvP
      // assíncrono (pvpController.js) pra não favorecer A por ordem de
      // comparação.
      if (duelo.danoTotalA !== duelo.danoTotalB) {
        vencedorChave = duelo.danoTotalA > duelo.danoTotalB ? "A" : "B";
      } else {
        const percA = duelo.a.estado.vida_atual / duelo.a.vidaMax;
        const percB = duelo.b.estado.vida_atual / duelo.b.vidaMax;
        if (percA === percB) {
          vencedorChave = crypto.randomInt(2) === 0 ? "A" : "B";
        } else {
          vencedorChave = percA > percB ? "A" : "B";
        }
      }
    }
    io.to(duelo.sala).emit("pvp:turno-resultado", { ...payloadTurno, turnoDe: null });
    // Duelos ranked setam `duelo.finalizar` (rankedLiveSocket.js) pra
    // persistir rating em vez de PvpStatus/PvpMatches — casual continua
    // usando finalizarDuelo direto, sem essa propriedade.
    //
    // AWAIT de propósito (bug reportado: "ranking ranqueado não
    // contabiliza") — antes disto era fire-and-forget: o duelo já saía
    // do mapa em memória (finalizarDueloRanked apaga isso antes até de
    // tentar persistir) enquanto a transaction que grava rating/V-D
    // ainda rodava em paralelo, sem ninguém aguardando o resultado. Uma
    // falha transitória na transaction só aparecia num console.error,
    // sem chance nenhuma de retry — e como o duelo já tinha sido
    // removido da memória, aquela partida ficava "EmAndamento" pra
    // sempre no banco (só o boot do servidor limpava isso, ver
    // encerrarPartidasOrfas/iniciarVarredorDePartidasOrfas), sem NUNCA
    // creditar a vitória real que o jogador tinha acabado de conquistar.
    const finalizar = duelo.finalizar || finalizarDuelo;
    await finalizar(io, duelId, vencedorChave, "combate");
    return;
  }

  duelo.turnoDe = chave === "A" ? "B" : "A";
  payloadTurno.turnoDe = duelo.turnoDe;
  payloadTurno.prazoSegundos = PRAZO_TURNO_MS / 1000;
  io.to(duelo.sala).emit("pvp:turno-resultado", payloadTurno);

  iniciarTimerDeTurno(io, duelId);

  // PvP v2 §6 — gancho pro lado controlado por IA agir quando o turno
  // vira pra ele (partida ranqueada assíncrona). Duelo casual e torneio
  // nunca setam `aoTrocarTurno`, então isto é no-op pra eles.
  duelo.aoTrocarTurno?.(io, duelId, duelo.turnoDe);
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
  // Mesmo cuidado do fim por combate (linha ~542): duelo de torneio seta
  // `duelo.finalizar` (finalizarJogoDeTorneio), que já sabe tratar
  // motivo "desistencia" e avançar a série/chave. Sem isto, uma
  // desconexão no meio de um jogo de torneio caía direto no finalize
  // casual — nunca chamava tournamentMatchService.registrarResultadoDeJogo,
  // a série nunca avançava, e ainda creditava recompensa casual (ouro/XP)
  // por engano numa partida de torneio.
  const finalizar = duelo.finalizar || finalizarDuelo;
  await finalizar(io, duelId, vencedorChave, "desistencia");
}

// Ranking v2 (§4/§22 da spec) — reaproveita o mesmo mapa `online` que já
// é a fonte autoritativa de presença (populado/limpo pelos eventos
// `identificar`/disconnect acima), em vez de inventar um segundo
// mecanismo ou persistir um boolean no banco sem expiração segura.
// rankingService só lê isto, nunca escreve.
function estaOnline(idPersonagem) {
  return online.has(String(idPersonagem));
}

module.exports.estaOnline = estaOnline;
module.exports.registrarAoIdentificar = registrarAoIdentificar;

// Exports adicionais só pra rankedLiveSocket.js reaproveitar a MESMA
// infraestrutura de presença/duelo ao vivo (§3 da spec — "usar a
// infraestrutura do duelo ao vivo"), sem duplicar motor de turno,
// carregamento de lutador ou mapas de presença/duelo em andamento.
module.exports.duelos = duelos;
module.exports.duelPorPersonagem = duelPorPersonagem;
module.exports.online = online;
module.exports.carregarLutador = carregarLutador;
module.exports.poderesPublicos = poderesPublicos;
module.exports.iniciarTimerDeTurno = iniciarTimerDeTurno;
module.exports.chaveOnline = chaveOnline;
module.exports.alocarDuelId = alocarDuelId;
module.exports.executarTurno = executarTurno;
module.exports.finalizarDuelo = finalizarDuelo;
module.exports.finalizarDueloPorDesistencia = finalizarDueloPorDesistencia;
module.exports.PRAZO_TURNO_MS = PRAZO_TURNO_MS;
module.exports.MAX_ACOES = MAX_ACOES;
