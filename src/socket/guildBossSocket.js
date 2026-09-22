// src/socket/guildBossSocket.js
//
// Boss da Guilda V2.0 — batalha em tempo real (spec do jogador: "igual
// em aventura"). Mesmo modelo de turnos do partySocket.js (grupo
// pequeno, cada um ataca na sua vez, timer por turno), mas contra o
// MESMO boss persistente da semana: cada golpe é salvo na hora via
// guildBossService.atacarBossAoVivo (a vida_restante da tentativa é
// compartilhada com o modo assíncrono antigo e com qualquer outra sala
// ao vivo da mesma guilda rodando em paralelo).
//
// Diferenças de propósito em relação à Aventura em grupo:
//   - Sem convite: qualquer membro da guilda pode entrar numa sala
//     aberta (a própria filiação à guilda já é o "convite").
//   - Sem "pronto": não tem anfitrião — qualquer um na sala pode
//     iniciar assim que houver pelo menos 1 participante.
//   - Sem consumíveis: "guildboss:acao" só aceita "attack"/"power",
//     nunca "item" (pedido explícito do jogador).
//   - Boss revida com dano crescente por rodada (dano_base_ataque na
//     rodada 1, escalando por BOSS_AO_VIVO_FATOR_ESCALADA_DANO) — o
//     modo assíncrono nunca causava dano de volta, só o novo modo ao
//     vivo faz o boss atacar.
//   - Ranking ao vivo (dano + número de ataques) já é a mesma
//     informação persistida em GuildBossContribution — dá pra ver
//     tanto durante a luta (broadcast a cada golpe) quanto depois via
//     GET /guilds/:id/boss (guildBossService.obterStatus).
//
// De propósito SEM "identificar" próprio: reaproveita socket.characterId
// já setado pelo "identificar" do pvpLiveSocket, mesmo raciocínio já
// documentado em partySocket.js (é a MESMA conexão, o PvpSocketProvider
// do frontend é global).

const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Class = require("../models/Class");
const GuildMember = require("../models/GuildMember");
const GuildBossAttempt = require("../models/GuildBossAttempt");
const GuildBossConfig = require("../models/GuildBossConfig");
const GuildLog = require("../models/GuildLog");
const { aplicarAcao } = require("../services/duelEngine");
const { custoManaEfetivo } = require("../services/combatFormulas");
const { atacarBossAoVivo, expirarSeNecessario } = require("../services/guildBossService");
const {
  BOSS_AO_VIVO_TAMANHO_MAXIMO,
  BOSS_AO_VIVO_TAMANHO_MINIMO,
  BOSS_AO_VIVO_PRAZO_TURNO_MS,
  BOSS_AO_VIVO_FATOR_ESCALADA_DANO,
  BOSS_AO_VIVO_MAX_RODADAS,
} = require("../config/guildConfig");
const { online, chaveOnline, carregarLutador, poderesPublicos } = require("./pvpLiveSocket");
const { emitParaGuild } = require("./guildSocket");

async function registrarLog(idGuild, tipo, { responsavel, detalhes, transaction } = {}) {
  await GuildLog.create(
    { id_guild: idGuild, tipo, id_personagem_responsavel: responsavel ?? null, detalhes: detalhes ?? null },
    { transaction },
  );
}

// idGuild -> { idGuild, participantes: Map<charId,{id,nome,classe}>, ordem: [charId] }
// Só existe ANTES da batalha começar — ao iniciar, vira uma `batalha` e
// some daqui (não sobrevive à corrida, sem "voltar pro lobby": quem
// quiser lutar de novo entra numa sala nova).
const lobbies = new Map();
// characterId (string) -> idGuild — só enquanto numa lobby (pré-batalha).
const lobbyPorPersonagem = new Map();

let proximaBatalhaId = 1;
// battleId -> batalha em andamento
const batalhas = new Map();
// characterId (string) -> battleId
const batalhaPorPersonagem = new Map();

function salaLobby(idGuild) {
  return `guildboss-lobby:${idGuild}`;
}

function salaBatalha(battleId) {
  return `guildboss-batalha:${battleId}`;
}

function participantesPublicos(lobby) {
  return lobby.ordem.map((id) => lobby.participantes.get(id)).filter(Boolean);
}

function emitirLobbyAtualizada(io, lobby) {
  io.to(salaLobby(lobby.idGuild)).emit("guildboss:lobby-atualizada", {
    idGuild: lobby.idGuild,
    participantes: participantesPublicos(lobby),
  });
}

function removerDaLobby(io, characterId) {
  const chave = chaveOnline(characterId);
  const idGuild = lobbyPorPersonagem.get(chave);
  if (!idGuild) return;
  const lobby = lobbies.get(idGuild);
  lobbyPorPersonagem.delete(chave);
  if (!lobby) return;

  lobby.participantes.delete(chave);
  lobby.ordem = lobby.ordem.filter((id) => id !== chave);

  const socketId = online.get(chave);
  const socketDoMembro = socketId ? io.sockets.sockets.get(socketId) : null;
  socketDoMembro?.leave(salaLobby(idGuild));

  if (lobby.participantes.size === 0) {
    lobbies.delete(idGuild);
  } else {
    emitirLobbyAtualizada(io, lobby);
  }
}

async function tentativaAtivaDaGuild(idGuild) {
  const tentativa = await GuildBossAttempt.findOne({ where: { id_guild: idGuild, status: "Ativo" } });
  if (!tentativa) return null;
  const atual = await expirarSeNecessario(tentativa, null, null);
  return atual.status === "Ativo" ? atual : null;
}

module.exports = function registerGuildBossHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("guildboss:entrar", async () => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit("guildboss:erro", { mensagem: "Identifique seu personagem antes de entrar." });
      }
      if (batalhaPorPersonagem.has(characterId) || lobbyPorPersonagem.has(characterId)) {
        return socket.emit("guildboss:erro", { mensagem: "Você já está numa sala ou batalha do Boss." });
      }

      try {
        const membro = await GuildMember.findOne({ where: { id_personagem: characterId } });
        if (!membro) {
          return socket.emit("guildboss:erro", { mensagem: "Você não pertence a nenhuma guilda." });
        }

        const tentativa = await tentativaAtivaDaGuild(membro.id_guild);
        if (!tentativa) {
          return socket.emit("guildboss:erro", { mensagem: "Não há Boss liberado (ou o tempo dele já esgotou)." });
        }

        let lobby = lobbies.get(membro.id_guild);
        if (!lobby) {
          lobby = { idGuild: membro.id_guild, participantes: new Map(), ordem: [] };
          lobbies.set(membro.id_guild, lobby);
        }
        if (lobby.participantes.size >= BOSS_AO_VIVO_TAMANHO_MAXIMO) {
          return socket.emit("guildboss:erro", { mensagem: `A sala já está cheia (máximo ${BOSS_AO_VIVO_TAMANHO_MAXIMO}).` });
        }

        const personagem = await Character.findByPk(characterId, { include: [{ model: Class }] });
        if (!personagem) {
          return socket.emit("guildboss:erro", { mensagem: "Personagem não encontrado." });
        }

        lobby.participantes.set(characterId, { id: personagem.id, nome: personagem.nome, classe: personagem.Class?.nome ?? null });
        lobby.ordem.push(characterId);
        lobbyPorPersonagem.set(characterId, membro.id_guild);
        socket.join(salaLobby(membro.id_guild));

        emitirLobbyAtualizada(io, lobby);
      } catch (error) {
        console.error("Erro ao entrar na sala do Boss da Guilda:", error);
        socket.emit("guildboss:erro", { mensagem: "Não foi possível entrar na sala do Boss." });
      }
    });

    socket.on("guildboss:sair", () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      removerDaLobby(io, characterId);
    });

    socket.on("guildboss:iniciar", async () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const idGuild = lobbyPorPersonagem.get(characterId);
      if (!idGuild) return socket.emit("guildboss:erro", { mensagem: "Você não está em nenhuma sala do Boss." });
      const lobby = lobbies.get(idGuild);
      if (!lobby) return;
      if (lobby.ordem.length < BOSS_AO_VIVO_TAMANHO_MINIMO) {
        return socket.emit("guildboss:erro", { mensagem: "Precisa de pelo menos 1 aventureiro pra iniciar." });
      }

      try {
        const tentativa = await tentativaAtivaDaGuild(idGuild);
        if (!tentativa) {
          lobbies.delete(idGuild);
          for (const id of lobby.ordem) lobbyPorPersonagem.delete(id);
          io.to(salaLobby(idGuild)).emit("guildboss:sala-desfeita", { motivo: "boss_indisponivel" });
          return;
        }
        const chefe = await GuildBossConfig.findByPk(tentativa.id_guild_boss_config);
        if (!chefe) return socket.emit("guildboss:erro", { mensagem: "Configuração do Boss não encontrada." });

        const membros = await Promise.all(lobby.ordem.map((id) => carregarLutador(id)));
        if (membros.some((m) => !m)) {
          return socket.emit("guildboss:erro", { mensagem: "Não foi possível carregar todos os personagens da sala." });
        }

        const battleId = proximaBatalhaId++;
        const sala = salaBatalha(battleId);
        const batalha = {
          id: battleId,
          idGuild,
          idBossAttempt: tentativa.id,
          sala,
          nomeChefe: chefe.nome_chefe,
          defesaChefe: chefe.defesa,
          danoBaseChefe: chefe.dano_base_ataque,
          vidaTotal: Number(tentativa.vida_total),
          vidaRestante: Number(tentativa.vida_restante),
          ordem: lobby.ordem.slice(),
          membros: new Map(membros.map((m) => [chaveOnline(m.id), m])),
          turnoIndex: 0,
          fase: "aliados", // "aliados" (percorrendo a ordem) | "chefe"
          rodada: 1,
          timer: null,
          processandoAcao: false,
        };
        batalhas.set(battleId, batalha);
        for (const id of lobby.ordem) {
          batalhaPorPersonagem.set(id, battleId);
          lobbyPorPersonagem.delete(id);
        }
        lobbies.delete(idGuild);

        const socketsDaLobby = io.sockets.adapter.rooms.get(salaLobby(idGuild));
        for (const socketId of socketsDaLobby || []) {
          const s = io.sockets.sockets.get(socketId);
          s?.leave(salaLobby(idGuild));
          s?.join(sala);
        }

        io.to(sala).emit("guildboss:batalha-iniciada", {
          battleId,
          nomeChefe: batalha.nomeChefe,
          vidaAtual: batalha.vidaRestante,
          vidaTotal: batalha.vidaTotal,
          membros: membros.map((m) => ({
            id: m.id,
            nome: m.nome,
            genero: m.genero,
            classe: m.classe,
            vidaMax: m.vidaMax,
            manaMax: m.manaMax,
            vida: m.estado.vida_atual,
            mana: m.estado.mana_atual,
            poderes: poderesPublicos(m.poderes),
          })),
          ordem: batalha.ordem,
          turnoDe: batalha.ordem[0],
          rodada: batalha.rodada,
          prazoSegundos: BOSS_AO_VIVO_PRAZO_TURNO_MS / 1000,
        });

        iniciarTimerDeTurno(io, battleId);
      } catch (error) {
        console.error("Erro ao iniciar batalha ao vivo do Boss da Guilda:", error);
        socket.emit("guildboss:erro", { mensagem: "Não foi possível iniciar a batalha." });
      }
    });

    // Sem "tipo: item" de propósito — consumíveis não podem ser usados
    // no Boss da Guilda ao vivo (pedido explícito do jogador).
    socket.on("guildboss:acao", async ({ tipo, idPoder } = {}) => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const battleId = batalhaPorPersonagem.get(characterId);
      if (!battleId) return socket.emit("guildboss:erro", { mensagem: "Você não está em nenhuma batalha." });
      const batalha = batalhas.get(battleId);
      if (!batalha) return;
      if (batalha.processandoAcao) {
        return socket.emit("guildboss:erro", { mensagem: "Aguarde, a última ação ainda está sendo processada." });
      }
      if (batalha.fase !== "aliados" || batalha.ordem[batalha.turnoIndex] !== characterId) {
        return socket.emit("guildboss:erro", { mensagem: "Ainda não é o seu turno." });
      }

      const atacante = batalha.membros.get(characterId);
      if (!atacante || atacante.estado.vida_atual <= 0) {
        return socket.emit("guildboss:erro", { mensagem: "Você não pode agir derrotado." });
      }

      let acao = { tipo: "attack" };
      if (tipo === "power") {
        const power = atacante.poderes.find((p) => p.id === Number(idPoder));
        if (!power) return socket.emit("guildboss:erro", { mensagem: "Poder inválido." });
        if (power.tipo_poder !== "Ativo") {
          return socket.emit("guildboss:erro", { mensagem: "Este poder não pode ser usado manualmente em combate." });
        }
        if (custoManaEfetivo(power, power.nivel_habilidade ?? 1) > atacante.estado.mana_atual) {
          return socket.emit("guildboss:erro", { mensagem: "Mana insuficiente para esse poder." });
        }
        acao = { tipo: "power", power };
      } else if (tipo !== "attack") {
        return socket.emit("guildboss:erro", { mensagem: "Ação inválida — consumíveis não podem ser usados contra o Boss da Guilda." });
      }

      await executarTurnoAliado(io, battleId, characterId, acao);
    });

    socket.on("disconnect", () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      // Mesma cautela do partySocket.js: só trata como saída real se
      // este ainda é o socket "dono" do personagem — um socket novo pro
      // mesmo characterId já assumiu `online` antes desse handler
      // rodar (de forma síncrona, em "identificar"), então comparar
      // igual (não diferente) trataria toda reconexão como abandono.
      const eraSocketAtivo = online.get(characterId) === socket.id;
      if (!eraSocketAtivo) return;
      removerDaLobby(io, characterId);
      sairDaBatalhaPorDesconexao(io, characterId);
    });
  });
};

function iniciarTimerDeTurno(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);
  batalha.timer = setTimeout(() => {
    if (batalha.fase !== "aliados") return;
    const characterId = batalha.ordem[batalha.turnoIndex];
    const atacante = batalha.membros.get(characterId);
    if (!atacante || atacante.estado.vida_atual <= 0) {
      avancarTurnoAliado(io, battleId);
      return;
    }
    executarTurnoAliado(io, battleId, characterId, { tipo: "attack" }, true);
  }, BOSS_AO_VIVO_PRAZO_TURNO_MS);
}

async function executarTurnoAliado(io, battleId, characterId, acao, foiAutomatico = false) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);
  batalha.processandoAcao = true;

  try {
    const atacante = batalha.membros.get(characterId);
    const chefeEstado = { defesa: batalha.defesaChefe, agilidade: 0, vida_atual: batalha.vidaRestante };
    const { nomeAcao, dano, cura, manaCurada, esquivou } = aplicarAcao({
      atacante: atacante.estado,
      defensor: chefeEstado,
      acao,
      vidaMaxAtacante: atacante.vidaMax,
      manaMaxAtacante: atacante.manaMax,
    });

    let vidaRestanteAtual = batalha.vidaRestante;
    let derrotado = false;
    let recompensas = null;

    if (dano > 0) {
      const resultado = await sequelize.transaction((transaction) =>
        atacarBossAoVivo(batalha.idGuild, characterId, dano, transaction, { registrarLog, emitirEvento: emitParaGuild }),
      );
      vidaRestanteAtual = Number(resultado.tentativa.vida_restante);
      derrotado = resultado.derrotado;
      recompensas = resultado.recompensas;
    }
    batalha.vidaRestante = vidaRestanteAtual;

    io.to(batalha.sala).emit("guildboss:turno-resultado", {
      battleId,
      origem: "aliado",
      idAtor: characterId,
      nomeAcao: foiAutomatico ? `${nomeAcao} (tempo esgotado)` : nomeAcao,
      dano,
      cura,
      manaCurada,
      esquivou,
      vidaChefe: batalha.vidaRestante,
      vidaAliado: atacante.estado.vida_atual,
      manaAliado: atacante.estado.mana_atual,
      rodada: batalha.rodada,
    });

    if (derrotado || batalha.vidaRestante <= 0) {
      return finalizarBatalha(io, battleId, true, recompensas);
    }

    batalha.processandoAcao = false;
    avancarTurnoAliado(io, battleId);
  } catch (error) {
    console.error("Erro ao processar turno do Boss da Guilda ao vivo:", error);
    batalha.processandoAcao = false;
    io.to(batalha.sala).emit("guildboss:erro", { mensagem: "Erro ao processar a ação — tente de novo." });
  }
}

// Igual ao partySocket.js — quem cai é pulado pela mesma checagem de
// "vivo" no resto do turno, sem travar o grupo esperando alguém que não
// vai mais agir.
function sairDaBatalhaPorDesconexao(io, characterId) {
  const battleId = batalhaPorPersonagem.get(characterId);
  if (!battleId) return;
  const batalha = batalhas.get(battleId);
  if (!batalha) {
    batalhaPorPersonagem.delete(characterId);
    return;
  }

  const membro = batalha.membros.get(characterId);
  if (membro) membro.estado.vida_atual = 0;

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    finalizarBatalha(io, battleId, false, null, "abandono");
    return;
  }

  io.to(batalha.sala).emit("guildboss:turno-resultado", {
    battleId,
    origem: "aliado",
    idAtor: characterId,
    nomeAcao: "Desconectou",
    dano: 0,
    esquivou: false,
    vidaAliado: 0,
    vidaChefe: batalha.vidaRestante,
    rodada: batalha.rodada,
  });

  if (batalha.fase === "aliados" && batalha.ordem[batalha.turnoIndex] === characterId && !batalha.processandoAcao) {
    avancarTurnoAliado(io, battleId);
  }
}

function proximoAliadoVivoIndex(batalha, apartirDe) {
  for (let i = apartirDe; i < batalha.ordem.length; i++) {
    const membro = batalha.membros.get(batalha.ordem[i]);
    if (membro && membro.estado.vida_atual > 0) return i;
  }
  return -1;
}

function avancarTurnoAliado(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const proximoIndex = proximoAliadoVivoIndex(batalha, batalha.turnoIndex + 1);
  if (proximoIndex !== -1) {
    batalha.turnoIndex = proximoIndex;
    io.to(batalha.sala).emit("guildboss:proximo-turno", {
      battleId,
      turnoDe: batalha.ordem[proximoIndex],
      prazoSegundos: BOSS_AO_VIVO_PRAZO_TURNO_MS / 1000,
      rodada: batalha.rodada,
    });
    iniciarTimerDeTurno(io, battleId);
    return;
  }

  // Todo mundo vivo já agiu nessa rodada — turno do chefe.
  executarTurnoChefe(io, battleId);
}

// Dano do chefe começa fraco (dano_base_ataque, rodada 1) e cresce a
// cada rodada — pedido explícito do jogador ("ataques fracos que vão
// aumentando o dano com o passar dos turnos"). Reaproveita
// calcularDanoBasico (via aplicarAcao) fabricando uma "força" que
// produz o dano-alvo da rodada, mesmo truque já usado em
// combatController.gerarInimigoDeGrupo pro monstro de grupo da Aventura.
function forcaChefeParaRodada(batalha) {
  const danoAlvo = batalha.danoBaseChefe * (1 + BOSS_AO_VIVO_FATOR_ESCALADA_DANO * (batalha.rodada - 1));
  return Math.max(1, Math.round((danoAlvo - 4) / 0.9));
}

function executarTurnoChefe(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const vivos = batalha.ordem
    .map((id) => batalha.membros.get(id))
    .filter((m) => m && m.estado.vida_atual > 0);

  if (vivos.length === 0) {
    return finalizarBatalha(io, battleId, false, null, "grupo_derrotado");
  }

  const alvo = vivos[Math.floor(Math.random() * vivos.length)];
  const chefeAtacante = { forca: forcaChefeParaRodada(batalha), nivel: 1, agilidade: 0 };
  const { nomeAcao, dano, esquivou } = aplicarAcao({
    atacante: chefeAtacante,
    defensor: alvo.estado,
    acao: { tipo: "attack" },
    vidaMaxAtacante: undefined,
  });

  io.to(batalha.sala).emit("guildboss:turno-resultado", {
    battleId,
    origem: "chefe",
    idAlvo: alvo.id,
    nomeAcao,
    dano,
    esquivou,
    vidaAliado: alvo.estado.vida_atual,
    vidaChefe: batalha.vidaRestante,
    rodada: batalha.rodada,
  });

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    return finalizarBatalha(io, battleId, false, null, "grupo_derrotado");
  }

  batalha.rodada += 1;
  if (batalha.rodada > BOSS_AO_VIVO_MAX_RODADAS) {
    return finalizarBatalha(io, battleId, false, null, "tempo_esgotado");
  }

  const primeiroVivoIndex = proximoAliadoVivoIndex(batalha, 0);
  batalha.turnoIndex = primeiroVivoIndex;
  batalha.fase = "aliados";

  io.to(batalha.sala).emit("guildboss:proximo-turno", {
    battleId,
    turnoDe: batalha.ordem[primeiroVivoIndex],
    prazoSegundos: BOSS_AO_VIVO_PRAZO_TURNO_MS / 1000,
    rodada: batalha.rodada,
  });
  iniciarTimerDeTurno(io, battleId);
}

function finalizarBatalha(io, battleId, vitoria, recompensas, motivo = vitoria ? "combate" : "derrota") {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);
  batalhas.delete(battleId);
  for (const id of batalha.ordem) {
    batalhaPorPersonagem.delete(id);
  }

  io.to(batalha.sala).emit("guildboss:batalha-fim", {
    battleId,
    vitoria,
    motivo,
    vidaChefe: batalha.vidaRestante,
    recompensas,
  });

  for (const socketId of io.sockets.adapter.rooms.get(batalha.sala) || []) {
    io.sockets.sockets.get(socketId)?.leave(batalha.sala);
  }
}
