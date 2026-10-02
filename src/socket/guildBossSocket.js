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
//   - Sem sala de espera/lobby — pedido do jogador ("entrar tipo
//     aventura"): "guildboss:entrar" já entrega o personagem DENTRO da
//     luta, nunca numa tela de espera por outros membros. Se já existe
//     uma luta em andamento contra a tentativa ativa da guilda, entra
//     nela (adicionado ao fim da fila de turnos); senão, abre uma luta
//     nova com só esse personagem — mais gente pode entrar a qualquer
//     momento depois, inclusive no meio de uma rodada.
//   - Sem consumíveis: "guildboss:acao" só aceita "attack"/"power",
//     nunca "item" (pedido explícito do jogador).
//   - Boss revida com dano crescente por rodada (dano_base_ataque na
//     rodada 1, escalando por BOSS_AO_VIVO_FATOR_ESCALADA_DANO) — o
//     modo assíncrono nunca causava dano de volta, só o novo modo ao
//     vivo faz o boss atacar. O turno do chefe sempre tem um telegraph
//     mínimo (BOSS_AO_VIVO_TELEGRAPH_MS) antes de resolver — mesmo
//     espírito do "ritmo de turno" que a Ameaça Mundial já tem
//     (worldboss.player_action_cooldown_ms): sem isso, "turno" virava
//     só o round-trip da rede, sem nenhuma pausa perceptível entre o
//     fim do seu ataque e o contra-ataque do chefe.
//   - Ranking ao vivo (dano + número de ataques) já é a mesma
//     informação persistida em GuildBossContribution — dá pra ver
//     tanto durante a luta (broadcast a cada golpe) quanto depois via
//     GET /guilds/:id/boss (guildBossService.obterStatus).
//   - Cooldown de 20min por membro (guildBossService.COOLDOWN_ATAQUE_MS)
//     checado na ENTRADA, não por golpe — dentro de uma luta já em
//     andamento os turnos seguem livres, só entrar numa luta NOVA (a
//     tentativa semanal trocou) é que espera o cooldown de novo.
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
// Cooldown real de Powers dentro da luta ao vivo — MESMO motor que o
// Boss Mundial usa (worldBossCombatService.js) e o combate solo da
// Aventura (combatController.js), nunca um paralelo: "cooldown 3"
// bloqueia exatamente os 3 PRÓXIMOS turnos DESTE ator (não da rodada
// inteira), documentado em cooldownService.js.
const cooldownService = require("../services/cooldownService");
const { atacarBossAoVivo, expirarSeNecessario, tempoRestanteCooldown } = require("../services/guildBossService");
// Lido via guildConfig.<chave> (nunca desestruturado) de propósito — são
// primitivos que o Painel Administrativo pode sobrescrever em tempo real
// (guildSettingsService.updateBalanceamento -> aplicarOverridesBalanceamento),
// e desestruturar um número congela o valor de quando este módulo deu
// require, ignorando qualquer ajuste feito depois no admin.
const guildConfig = require("../config/guildConfig");
const { online, chaveOnline, carregarLutador, poderesPublicos } = require("./pvpLiveSocket");
const { emitParaGuild } = require("./guildSocket");

async function registrarLog(idGuild, tipo, { responsavel, detalhes, transaction } = {}) {
  await GuildLog.create(
    { id_guild: idGuild, tipo, id_personagem_responsavel: responsavel ?? null, detalhes: detalhes ?? null },
    { transaction },
  );
}

let proximaBatalhaId = 1;
// battleId -> batalha em andamento
const batalhas = new Map();
// characterId (string) -> battleId
const batalhaPorPersonagem = new Map();
// idGuild -> battleId — a luta "corrente" da guilda, se houver. Sem
// sala de espera, "guildboss:entrar" usa isto pra decidir se entra numa
// luta já em andamento ou abre uma nova (ver comentário no topo do
// arquivo).
const batalhaPorGuild = new Map();

function salaBatalha(battleId) {
  return `guildboss-batalha:${battleId}`;
}

// Duas funções PURAS (sem I/O, testadas isoladamente em
// test/guildBossCooldown.test.js) que envelopam cooldownService pro
// formato desta batalha — `atacante.cooldowns` é o MESMO formato
// `{ "power:<id>": turnosRestantes }` de sessao.state.cooldowns no Boss
// Mundial (worldBossCombatService.executarAcao) e de cooldowns.player
// no combate solo (combatController.js).
function podeUsarPoderNaBatalha(atacante, power) {
  return cooldownService.podeUsar(atacante.cooldowns ?? {}, power.id);
}

// Chamada UMA VEZ por turno do ator, depois que a ação JÁ foi validada
// (Mana/turno/cooldown) e resolvida contra o chefe — nunca antes disso
// (mesmo contrato de cooldownService.iniciarCooldown). Ataque básico só
// decrementa os cooldowns já ativos de turnos anteriores; Power inicia
// o próprio cooldown e decrementa os DEMAIS, exatamente como
// worldBossCombatService/combatController fazem (`chaveRecemAplicada`
// nunca decrementa no turno em que foi usada).
function registrarUsoDePoder(atacante, acao) {
  const atuais = atacante.cooldowns ?? {};
  if (acao.tipo !== "power") {
    atacante.cooldowns = cooldownService.decrementarCooldowns(atuais);
    return;
  }
  const comCooldownIniciado =
    acao.power.cooldown > 0 ? cooldownService.iniciarCooldown(atuais, acao.power.id, acao.power.cooldown) : atuais;
  const chaveRecemAplicada = new Set([cooldownService.chaveDoPoder(acao.power.id)]);
  atacante.cooldowns = cooldownService.decrementarCooldowns(comCooldownIniciado, chaveRecemAplicada);
}

async function tentativaAtivaDaGuild(idGuild) {
  const tentativa = await GuildBossAttempt.findOne({ where: { id_guild: idGuild, status: "Ativo" } });
  if (!tentativa) return null;
  const atual = await expirarSeNecessario(tentativa, null, null);
  return atual.status === "Ativo" ? atual : null;
}

// Mesmo formato de membro público usado em "batalha-iniciada" (criação)
// e "membro-entrou" (entrada no meio de uma luta já em andamento) —
// nunca duas cópias desse objeto.
function membroPublico(m) {
  return {
    id: m.id,
    nome: m.nome,
    genero: m.genero,
    classe: m.classe,
    vidaMax: m.vidaMax,
    manaMax: m.manaMax,
    vida: m.estado.vida_atual,
    mana: m.estado.mana_atual,
    poderes: poderesPublicos(m.poderes),
  };
}

// Estado completo de uma luta em andamento — usado tanto pra quem
// acabou de abrir/entrar numa luta (resposta direta de
// "guildboss:entrar") quanto, futuramente, por qualquer resync. `turnoDe`
// só faz sentido durante a fase "aliados" (fase "chefe" = telegraph ou
// resolução do contra-ataque em andamento, ninguém pode agir).
function montarEstadoBatalha(batalha) {
  return {
    battleId: batalha.id,
    nomeChefe: batalha.nomeChefe,
    vidaAtual: batalha.vidaRestante,
    vidaTotal: batalha.vidaTotal,
    membros: batalha.ordem
      .map((id) => batalha.membros.get(chaveOnline(id)))
      .filter(Boolean)
      .map(membroPublico),
    ordem: batalha.ordem,
    turnoDe: batalha.fase === "aliados" ? batalha.ordem[batalha.turnoIndex] : null,
    fase: batalha.fase,
    rodada: batalha.rodada,
    prazoSegundos: guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS / 1000,
  };
}

// Abre uma luta nova contra a `tentativa` ativa da guilda, já com
// `characterIdInicial` dentro — nunca espera mais ninguém (ver
// comentário no topo do arquivo: "entrar tipo aventura"). Mais membros
// entram depois via o branch de "luta em andamento" de
// "guildboss:entrar", a qualquer momento, inclusive no meio de uma
// rodada.
async function criarBatalha(io, idGuild, tentativa, characterIdInicial, socketIniciador) {
  const chefe = await GuildBossConfig.findByPk(tentativa.id_guild_boss_config);
  if (!chefe) {
    socketIniciador?.emit("guildboss:erro", { mensagem: "Configuração do Boss não encontrada." });
    return;
  }

  // Proezas Únicas §11 — Guild Boss é PERMITIDO pra Legado (a menos que
  // o UniquePowerEffect específico diga o contrário via
  // allow_guild_boss), então passa o contexto certo em vez de deixar
  // cair no default de duelo casual.
  const lutador = await carregarLutador(characterIdInicial, { contexto: "GUILD_BOSS" });
  if (!lutador) {
    socketIniciador?.emit("guildboss:erro", { mensagem: "Não foi possível carregar seu personagem." });
    return;
  }
  // Cooldown de Powers por ATOR (não por batalha) — cada membro entra
  // com o mapa vazio, igual toda sessão nova do Boss Mundial.
  lutador.cooldowns = {};

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
    ordem: [characterIdInicial],
    // cooldowns por membro (turnos, cooldownService — mesmo motor
    // genérico já usado em PvE/World Boss) some junto com a batalha (§
    // nunca persistido, mesmo critério de cooldownService.js: "acaba a
    // luta, os cooldowns somem").
    membros: new Map([[chaveOnline(lutador.id), lutador]]),
    turnoIndex: 0,
    fase: "aliados", // "aliados" (percorrendo a ordem) | "chefe"
    rodada: 1,
    timer: null,
    processandoAcao: false,
  };
  batalhas.set(battleId, batalha);
  batalhaPorGuild.set(idGuild, battleId);
  batalhaPorPersonagem.set(characterIdInicial, battleId);

  socketIniciador?.join(sala);

  io.to(sala).emit("guildboss:batalha-iniciada", montarEstadoBatalha(batalha));

  iniciarTimerDeTurno(io, battleId);
}

module.exports = function registerGuildBossHandlers(io) {
  io.on("connection", (socket) => {
    // Sem sala de espera (pedido do jogador: "entrar tipo aventura") —
    // este evento é o ÚNICO passo pra entrar na luta: se a guilda já
    // tem uma luta rolando contra a tentativa ativa, entra nela (fim da
    // fila de turnos); senão, abre uma luta nova já com este personagem
    // dentro, sem esperar mais ninguém (ver criarBatalha).
    socket.on("guildboss:entrar", async () => {
      const characterId = socket.characterId;
      if (!characterId) {
        return socket.emit("guildboss:erro", { mensagem: "Identifique seu personagem antes de entrar." });
      }

      // Reconexão/F5/segunda aba — já está numa luta, só rejunta a sala
      // e reenvia o estado atual, nunca cria outra.
      const battleIdAtual = batalhaPorPersonagem.get(characterId);
      if (battleIdAtual) {
        const batalhaAtual = batalhas.get(battleIdAtual);
        if (batalhaAtual) {
          socket.join(batalhaAtual.sala);
          return socket.emit("guildboss:estado", montarEstadoBatalha(batalhaAtual));
        }
        batalhaPorPersonagem.delete(characterId);
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

        const restanteMs = await tempoRestanteCooldown(membro.id_guild, characterId);
        if (restanteMs > 0) {
          return socket.emit("guildboss:erro", {
            mensagem: `Aguarde ${Math.ceil(restanteMs / 60000)}min antes de atacar o Boss de novo.`,
          });
        }

        const battleIdDaGuild = batalhaPorGuild.get(membro.id_guild);
        const batalhaEmAndamento = battleIdDaGuild ? batalhas.get(battleIdDaGuild) : null;

        // Já tem gente da guilda lutando contra ESTA MESMA tentativa —
        // entra direto nela, no fim da fila de turnos (nunca cria uma
        // segunda luta concorrente pra mesma tentativa).
        if (batalhaEmAndamento && batalhaEmAndamento.idBossAttempt === tentativa.id) {
          if (batalhaEmAndamento.membros.size >= guildConfig.BOSS_AO_VIVO_TAMANHO_MAXIMO) {
            return socket.emit("guildboss:erro", {
              mensagem: `A luta já está cheia (máximo ${guildConfig.BOSS_AO_VIVO_TAMANHO_MAXIMO}).`,
            });
          }

          // Proezas Únicas §11 — mesmo contexto de criarBatalha abaixo.
          const lutador = await carregarLutador(characterId, { contexto: "GUILD_BOSS" });
          if (!lutador) {
            return socket.emit("guildboss:erro", { mensagem: "Não foi possível carregar seu personagem." });
          }
          lutador.cooldowns = {};
          batalhaEmAndamento.membros.set(chaveOnline(lutador.id), lutador);
          batalhaEmAndamento.ordem.push(characterId);
          batalhaPorPersonagem.set(characterId, batalhaEmAndamento.id);
          socket.join(batalhaEmAndamento.sala);

          io.to(batalhaEmAndamento.sala).emit("guildboss:membro-entrou", {
            battleId: batalhaEmAndamento.id,
            membro: membroPublico(lutador),
            ordem: batalhaEmAndamento.ordem,
          });
          return socket.emit("guildboss:estado", montarEstadoBatalha(batalhaEmAndamento));
        }

        // Ninguém da guilda lutando agora contra esta tentativa — abre
        // a luta já com este personagem dentro.
        await criarBatalha(io, membro.id_guild, tentativa, characterId, socket);
      } catch (error) {
        console.error("Erro ao entrar no Boss da Guilda:", error);
        socket.emit("guildboss:erro", { mensagem: "Não foi possível entrar na luta do Boss." });
      }
    });

    // Sem sala de espera pra "sair" de verdade — só para de receber os
    // eventos da luta (o turno dele, se chegar a vez, segue andando
    // sozinho pelo timer, igual qualquer ausência). "entrar" de novo
    // rejunta a MESMA luta (ver branch de reconexão acima), nunca cria
    // outra.
    socket.on("guildboss:sair", () => {
      const characterId = socket.characterId;
      if (!characterId) return;
      const battleId = batalhaPorPersonagem.get(characterId);
      if (!battleId) return;
      const batalha = batalhas.get(battleId);
      if (batalha) socket.leave(batalha.sala);
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
        if (!podeUsarPoderNaBatalha(atacante, power)) {
          const restante = cooldownService.turnosRestantes(atacante.cooldowns ?? {}, power.id);
          return socket.emit("guildboss:erro", { mensagem: `Essa habilidade ainda está em cooldown (${restante} turno(s)).` });
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
  }, guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS);
}

async function executarTurnoAliado(io, battleId, characterId, acao, foiAutomatico = false) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;
  clearTimeout(batalha.timer);
  batalha.processandoAcao = true;

  try {
    const atacante = batalha.membros.get(characterId);
    const chefeEstado = { defesa: batalha.defesaChefe, agilidade: 0, vida_atual: batalha.vidaRestante };
    const { nomeAcao, dano, cura, manaCurada, esquivou, critico } = aplicarAcao({
      atacante: atacante.estado,
      defensor: chefeEstado,
      acao,
      vidaMaxAtacante: atacante.vidaMax,
      manaMaxAtacante: atacante.manaMax,
    });

    // Fim do "turno" deste ator (§ mesma semântica do Boss Mundial):
    // ação já validada/consumida acima (Mana/turno/cooldown checados
    // antes de chegar aqui) — Power recém-usado inicia o próprio
    // cooldown, e TODOS os cooldowns ativos do ator decrementam agora,
    // dano ou não (esquiva também consome o cooldown, igual em
    // worldBossCombatService/combatController).
    registrarUsoDePoder(atacante, acao);

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
      critico: Boolean(critico),
      vidaChefe: batalha.vidaRestante,
      vidaAliado: atacante.estado.vida_atual,
      manaAliado: atacante.estado.mana_atual,
      rodada: batalha.rodada,
      // Cooldowns ATUAIS do próprio ator (formato "power:<id>" ->
      // turnos restantes, igual ao Boss Mundial) — só quem agiu
      // interessa aqui; o frontend usa isto pra desenhar a mesma
      // barra/badge de cooldown que WorldBossArena.tsx já desenha.
      cooldowns: atacante.cooldowns ?? {},
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
      prazoSegundos: guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS / 1000,
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
  const danoAlvo = batalha.danoBaseChefe * (1 + guildConfig.BOSS_AO_VIVO_FATOR_ESCALADA_DANO * (batalha.rodada - 1));
  return Math.max(1, Math.round((danoAlvo - 4) / 0.9));
}

// Boss da Guilda não tem habilidade/IA própria (o CRUD/seleção
// ponderada de poder — GuildBossAbility/bossAbilityAiService — era um
// WIP nunca validado de ponta a ponta e ficou de fora da Fase 1; ver
// combatController/worldBossRuntimeService pra quando isso existir de
// verdade). O chefe sempre dá um ataque básico, mas AVISA a sala com um
// telegraph mínimo antes de resolver — igual em espírito ao
// "cast_pendente" do World Boss (pedido do jogador: "ritmo de turno
// igual à Ameaça Mundial" — sem isso, o contra-ataque resolvia
// instantâneo, sem nenhuma pausa perceptível). `batalha.fase` vira
// "chefe" AQUI e só volta pra "aliados" no fim de resolverAcaoDoChefe:
// durante o telegraph nenhuma ação de jogador é aceita (ver
// guildboss:acao, que checa fase === "aliados").
function executarTurnoChefe(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const vivos = batalha.ordem
    .map((id) => batalha.membros.get(id))
    .filter((m) => m && m.estado.vida_atual > 0);

  if (vivos.length === 0) {
    return finalizarBatalha(io, battleId, false, null, "grupo_derrotado");
  }

  io.to(batalha.sala).emit("guildboss:cast-start", {
    battleId,
    nomePoder: null,
    imagemUrl: null,
    tempoConjuracaoMs: guildConfig.BOSS_AO_VIVO_TELEGRAPH_MS,
    rodada: batalha.rodada,
  });
  clearTimeout(batalha.timer);
  batalha.timer = setTimeout(() => resolverAcaoDoChefe(io, battleId), guildConfig.BOSS_AO_VIVO_TELEGRAPH_MS);
}

function resolverAcaoDoChefe(io, battleId) {
  const batalha = batalhas.get(battleId);
  if (!batalha) return;

  const vivos = batalha.ordem.map((id) => batalha.membros.get(id)).filter((m) => m && m.estado.vida_atual > 0);
  if (vivos.length === 0) {
    return finalizarBatalha(io, battleId, false, null, "grupo_derrotado");
  }

  const alvo = vivos[Math.floor(Math.random() * vivos.length)];
  const chefeAtacante = { forca: forcaChefeParaRodada(batalha), nivel: 1, agilidade: 0 };
  const { nomeAcao, dano, esquivou, critico } = aplicarAcao({
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
    critico: Boolean(critico),
    vidaAliado: alvo.estado.vida_atual,
    vidaChefe: batalha.vidaRestante,
    rodada: batalha.rodada,
  });

  const alguemVivo = batalha.ordem.some((id) => batalha.membros.get(id)?.estado.vida_atual > 0);
  if (!alguemVivo) {
    return finalizarBatalha(io, battleId, false, null, "grupo_derrotado");
  }

  batalha.rodada += 1;
  if (batalha.rodada > guildConfig.BOSS_AO_VIVO_MAX_RODADAS) {
    return finalizarBatalha(io, battleId, false, null, "tempo_esgotado");
  }

  const primeiroVivoIndex = proximoAliadoVivoIndex(batalha, 0);
  batalha.turnoIndex = primeiroVivoIndex;
  batalha.fase = "aliados";

  io.to(batalha.sala).emit("guildboss:proximo-turno", {
    battleId,
    turnoDe: batalha.ordem[primeiroVivoIndex],
    prazoSegundos: guildConfig.BOSS_AO_VIVO_PRAZO_TURNO_MS / 1000,
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
  // Só remove de batalhaPorGuild se ainda aponta pra ESTA luta — uma
  // guilda pode, em tese, já ter uma luta nova (outra tentativa) nesse
  // mapa por uma corrida rara; nunca apagar o ponteiro de uma luta que
  // não é esta.
  if (batalhaPorGuild.get(batalha.idGuild) === battleId) {
    batalhaPorGuild.delete(batalha.idGuild);
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

// Exportadas só pra teste unitário puro (test/guildBossCooldown.test.js)
// — nunca chamadas de fora deste arquivo em produção.
module.exports.podeUsarPoderNaBatalha = podeUsarPoderNaBatalha;
module.exports.registrarUsoDePoder = registrarUsoDePoder;
