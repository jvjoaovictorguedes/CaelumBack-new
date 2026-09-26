// src/socket/rankedLiveSocket.js
//
// Arena Ranqueada v2 — partida ASSÍNCRONA (PvP v2 §6/§8/§9/§10/§12).
//
// O que mudou em relação à v1: a fila em tempo real foi removida. O
// jogador chama POST /api/pvp/ranked/match/start, o servidor escolhe o
// oponente (rankedOpponentSelectionService), carrega um SNAPSHOT
// completo do personagem dele e a partida começa na hora — o oponente
// não precisa estar online nem aceitar nada, e quem joga por ele é a
// IA (rankedAiService).
//
// O que NÃO mudou: o motor de combate. Este módulo continua sem
// duplicar turno, dano, carregamento de lutador ou presença — tudo vem
// de pvpLiveSocket.js. Um duelo ranqueado é um duelo normal inserido
// nos MESMOS mapas (`duelos`/`duelPorPersonagem`), então o handler
// "pvp:acao" já existente resolve as ações do humano turno a turno,
// exatamente como no duelo ao vivo. A única diferença é que o lado B
// não tem socket: ele age pelo gancho `aoTrocarTurno`.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const RankedMatch = require("../models/RankedMatch");
const Character = require("../models/Character");
const rankedRatingService = require("../services/rankedRatingService");
const rankedTierService = require("../services/rankedTierService");
const rankedSeasonService = require("../services/rankedSeasonService");
const rankedOpponentSelectionService = require("../services/rankedOpponentSelectionService");
const rankedDailyLimitService = require("../services/rankedDailyLimitService");
const rankedAiService = require("../services/rankedAiService");
const tournamentService = require("../services/tournamentService");
const pvpLiveSocket = require("./pvpLiveSocket");
const { JANELA_RECONEXAO_SEGUNDOS, IA_DELAY_TURNO_MS } = require("../config/rankedConfig");

const NOME_ARENA_RANKED = "Arena Ranqueada de Caelum";

// §18 — observabilidade: um prefixo só, fácil de grepar no log.
function log(evento, dados) {
  console.log(`[ranked] ${evento}`, JSON.stringify(dados));
}

function montarPayloadInicio(duelo, ehResync = false) {
  return {
    duelId: duelo.id,
    arena: NOME_ARENA_RANKED,
    ranked: true,
    assincrono: true,
    rankedMatchId: duelo.rankedMatchId,
    temporada: { id: duelo.seasonId },
    a: { id: duelo.a.id, nome: duelo.a.nome, genero: duelo.a.genero, classe: duelo.a.classe, chave: "A" },
    b: {
      id: duelo.b.id,
      nome: duelo.b.nome,
      genero: duelo.b.genero,
      classe: duelo.b.classe,
      chave: "B",
      controladoPorIA: true,
    },
    ratingA: duelo.ratingAntes.A,
    ratingB: duelo.ratingAntes.B,
    tierA: rankedTierService.resumoTier(duelo.ratingAntes.A),
    tierB: rankedTierService.resumoTier(duelo.ratingAntes.B),
    vidaMaxA: duelo.a.vidaMax,
    vidaMaxB: duelo.b.vidaMax,
    manaMaxA: duelo.a.manaMax,
    manaMaxB: duelo.b.manaMax,
    vidaA: duelo.a.estado.vida_atual,
    vidaB: duelo.b.estado.vida_atual,
    manaA: duelo.a.estado.mana_atual,
    manaB: duelo.b.estado.mana_atual,
    poderesA: pvpLiveSocket.poderesPublicos(duelo.a.poderes),
    poderesB: pvpLiveSocket.poderesPublicos(duelo.b.poderes),
    // §10 — consumíveis desabilitados no ranqueado: a lista vai vazia
    // pro cliente nem oferecer o botão, e o servidor rejeita de novo
    // caso alguém mande mesmo assim (pvpLiveSocket.js).
    consumiveisA: [],
    consumiveisB: [],
    consumiveisHabilitados: false,
    turnoDe: duelo.turnoDe,
    prazoSegundos: pvpLiveSocket.PRAZO_TURNO_MS / 1000,
    resync: ehResync,
  };
}

function limparGraceTimers(duelo) {
  if (!duelo.desconexoes) return;
  for (const timer of Object.values(duelo.desconexoes)) clearTimeout(timer);
  duelo.desconexoes = {};
}

// §9/§11 — desconexão do jogador humano: janela de reconexão e, se não
// voltar, derrota por abandono. Abandono NÃO devolve tentativa diária.
function aoDesconectarRanked(io, duelId, characterId) {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  const chave = duelo.a.id === Number(characterId) ? "A" : "B";
  if (chave === duelo.ia) return; // o lado da IA não tem socket pra cair

  duelo.desconexoes = duelo.desconexoes || {};
  if (duelo.desconexoes[chave]) return;

  io.to(duelo.sala).emit("ranked:oponente-desconectado", {
    characterId: Number(characterId),
    prazoSegundos: JANELA_RECONEXAO_SEGUNDOS,
  });

  duelo.desconexoes[chave] = setTimeout(() => {
    const vencedorChave = chave === "A" ? "B" : "A";
    finalizarDueloRanked(io, duelId, vencedorChave, "abandono");
  }, JANELA_RECONEXAO_SEGUNDOS * 1000);
}

function aoReconectarRanked(io, socket, duelId) {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  const characterId = socket.characterId;
  const chave = duelo.a.id === Number(characterId) ? "A" : "B";
  if (duelo.desconexoes?.[chave]) {
    clearTimeout(duelo.desconexoes[chave]);
    delete duelo.desconexoes[chave];
  }

  socket.join(duelo.sala);
  io.to(duelo.sala).emit("ranked:oponente-reconectado", { characterId: Number(characterId) });
  socket.emit("ranked:match:start", montarPayloadInicio(duelo, true));
}

// §6/§9 — quando o turno passa pro lado da IA, ela decide e age depois
// de um pequeno atraso (pro cliente conseguir animar o turno anterior).
// Reaproveita executarTurno do motor casual: a IA não tem caminho de
// resolução próprio.
function agendarTurnoIA(io, duelId, turnoDe) {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo || duelo.ia !== turnoDe) return;

  clearTimeout(duelo.timerIA);
  duelo.timerIA = setTimeout(() => {
    const atual = pvpLiveSocket.duelos.get(duelId);
    if (!atual || atual.turnoDe !== turnoDe) return;

    const lutadorIA = turnoDe === "A" ? atual.a : atual.b;
    const { acao, resumo } = rankedAiService.escolherAcaoIA(lutadorIA);
    log("ia:decisao", { duelId, rankedMatchId: atual.rankedMatchId, ...resumo });
    pvpLiveSocket.executarTurno(io, duelId, turnoDe, acao);
  }, IA_DELAY_TURNO_MS);
}

// Retry da transação de persistência (ver finalizarDueloRanked abaixo).
// O duelo já saiu de pvpLiveSocket.duelos ANTES desta função rodar —
// de propósito: uma vez que o combate acabou, nada mais pode agir sobre
// aquele duelId (sem isso, uma ação de turno atrasada ou um segundo
// gatilho de finalização — abandono batendo quase junto com o combate —
// podia tentar operar num duelo "morto"). Isso significa que, se a
// transação falhar, NÃO há como reconstruir o resultado a partir do
// banco — só o processo que já está rodando esta função ainda tem o
// resultado real (`vencedorChave`) em memória. Por isso o retry
// acontece AQUI, dentro da mesma chamada, com o resultado calculado já
// em mãos — nunca reprocessando a partir de fora depois que esta função
// retornar. `encerrarPartidasOrfas`/`iniciarVarredorDePartidasOrfas`
// continuam existindo como a rede de segurança final (para falhas que
// sobrevivem a todas as tentativas, ou pra um crash do processo no meio
// do caminho) — não precisam de uma segunda infraestrutura, só de mais
// algumas chances antes de desistir e cair nela.
const FINALIZACAO_MAX_TENTATIVAS = 3;
const FINALIZACAO_RETRY_BASE_MS = 200;

function aguardarMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// §12 — finalização ATÔMICA e IDEMPOTENTE.
//
// Tudo numa transação só: rating do desafiante, V/D sazonal, linha de
// RankedMatch. A guarda de idempotência é o próprio status da partida,
// lido com SELECT ... FOR UPDATE: se já está "Finalizada", a chamada
// vira no-op (o mesmo duelo podia ser finalizado por combate e por
// timer de abandono quase ao mesmo tempo).
//
// `motivo`: "combate" | "abandono" | "falha-servidor". Falha comprovada
// do servidor não altera rating E devolve a tentativa diária (§11).
// Isso é DIFERENTE de uma falha ao PERSISTIR o resultado (a transação
// abaixo lançando erro) — a primeira é sobre COMO o combate terminou, a
// segunda é sobre o banco não conseguir gravar o que já foi decidido;
// nunca confundir as duas.
async function finalizarDueloRanked(io, duelId, vencedorChave, motivo = "combate") {
  const duelo = pvpLiveSocket.duelos.get(duelId);
  if (!duelo) return;

  clearTimeout(duelo.timer);
  clearTimeout(duelo.timerIA);
  limparGraceTimers(duelo);
  pvpLiveSocket.duelos.delete(duelId);
  pvpLiveSocket.duelPorPersonagem.delete(String(duelo.a.id));
  // O defensor assíncrono nunca entra em duelPorPersonagem (ele não está
  // "ocupado" — pode estar jogando outra coisa), então não há o que
  // limpar do lado dele.

  const chaveHumano = duelo.ia === "B" ? "A" : "B";
  const humanoVenceu = vencedorChave === chaveHumano;
  const idDesafiante = duelo.desafianteId;

  let resultado = null;
  let motivoFinal = motivo === "abandono" ? "Abandono" : "Vitoria";
  if (motivo === "falha-servidor") motivoFinal = "FalhaServidor";

  log("partida:finalizando", {
    duelId,
    rankedMatchId: duelo.rankedMatchId,
    desafiante: idDesafiante,
    defensor: duelo.defensorId,
    motivo: motivoFinal,
    humanoVenceu,
  });

  let persistiu = false;
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= FINALIZACAO_MAX_TENTATIVAS && !persistiu; tentativa++) {
    resultado = null;
    try {
      await sequelize.transaction(async (transaction) => {
        const [linhas] = await sequelize.query(
          `SELECT id, status FROM ranked_matches WHERE id = :id FOR UPDATE;`,
          { replacements: { id: duelo.rankedMatchId }, transaction },
        );
        const partida = linhas[0];
        if (!partida) throw new Error(`RankedMatch ${duelo.rankedMatchId} não encontrada.`);
        if (partida.status === "Finalizada") {
          log("finalizacao:ignorada-idempotente", { duelId, rankedMatchId: duelo.rankedMatchId });
          return;
        }

        if (motivoFinal !== "FalhaServidor") {
          resultado = await rankedRatingService.aplicarResultadoDesafiante({
            idDesafiante,
            seasonId: duelo.seasonId,
            ratingOponente: duelo.ratingAntes[duelo.ia],
            venceu: humanoVenceu,
            transaction,
          });
        } else {
          // §11 — falha comprovada do servidor devolve a tentativa. Dentro
          // da MESMA transação, pra nunca estornar sem registrar o motivo.
          await rankedDailyLimitService.devolverTentativa(idDesafiante, {
            transaction,
            dateKey: duelo.dateKey,
          });
        }

        await RankedMatch.update(
          {
            id_vencedor: resultado ? (humanoVenceu ? idDesafiante : duelo.defensorId) : null,
            rating_jogador1_depois: resultado ? resultado.ratingDepois : null,
            // §8 — o defensor controlado por IA NUNCA tem rating alterado:
            // a coluna "depois" dele fica NULL de propósito.
            rating_jogador2_depois: null,
            delta_desafiante: resultado ? resultado.delta : null,
            motivo_encerramento: motivoFinal,
            status: "Finalizada",
            encerrada_em: new Date(),
          },
          { where: { id: duelo.rankedMatchId }, transaction },
        );

        log("finalizacao:persistido", {
          duelId,
          rankedMatchId: duelo.rankedMatchId,
          tentativa,
          ratingAntes: resultado?.ratingAntes ?? null,
          ratingDepois: resultado?.ratingDepois ?? null,
          delta: resultado?.delta ?? null,
        });
      });
      persistiu = true;
    } catch (error) {
      ultimoErro = error;
      console.error(
        `[ranked] Falha ao persistir finalização (tentativa ${tentativa}/${FINALIZACAO_MAX_TENTATIVAS}) da partida ${duelo.rankedMatchId}:`,
        error,
      );
      if (tentativa < FINALIZACAO_MAX_TENTATIVAS) {
        log("finalizacao:retry", { duelId, rankedMatchId: duelo.rankedMatchId, tentativa, erro: error.message });
        await aguardarMs(FINALIZACAO_RETRY_BASE_MS * tentativa);
      }
    }
  }

  if (!persistiu) {
    // Todas as tentativas falharam de verdade — a partida fica
    // "EmAndamento" no banco (a transação sempre dá ROLLBACK sozinha em
    // caso de erro, nunca deixa RankedMatch=Finalizada com
    // CharacterPvpSeason não tocado, ou vice-versa). O varredor de
    // partidas órfãs (iniciarVarredorDePartidasOrfas, a cada poucos
    // minutos) é quem fecha isso depois, devolvendo a tentativa diária —
    // única saída honesta quando o resultado real não pôde ser
    // confirmado no banco de jeito nenhum.
    console.error(
      `[ranked] Falha ao finalizar partida ranqueada ${duelo.rankedMatchId} após ${FINALIZACAO_MAX_TENTATIVAS} tentativas:`,
      ultimoErro,
    );
    io.to(duelo.sala).emit("pvp:erro", { mensagem: "Erro ao finalizar a partida ranqueada." });
    return;
  }

  log("partida:fim", {
    duelId,
    rankedMatchId: duelo.rankedMatchId,
    desafiante: idDesafiante,
    defensor: duelo.defensorId,
    motivo: motivoFinal,
    humanoVenceu,
    ratingAntes: resultado?.ratingAntes ?? null,
    ratingDepois: resultado?.ratingDepois ?? null,
    delta: resultado?.delta ?? 0,
    acoes: duelo.acoes,
  });

  io.to(duelo.sala).emit("pvp:duelo-fim", {
    duelId,
    vencedorChave: resultado ? vencedorChave : null,
    vencedor: resultado
      ? humanoVenceu
        ? { id: duelo.a.id, nome: duelo.a.nome }
        : { id: duelo.b.id, nome: duelo.b.nome }
      : null,
    perdedor: resultado
      ? humanoVenceu
        ? { id: duelo.b.id, nome: duelo.b.nome }
        : { id: duelo.a.id, nome: duelo.a.nome }
      : null,
    motivo: motivoFinal,
    ranked: true,
  });

  if (resultado) {
    io.to(duelo.sala).emit("ranked:rating:update", {
      duelId,
      ratingAntes: resultado.ratingAntes,
      ratingDepois: resultado.ratingDepois,
      delta: resultado.delta,
      tierAntes: rankedTierService.resumoTier(resultado.ratingAntes),
      tierDepois: rankedTierService.resumoTier(resultado.ratingDepois),
      // §8 — explicitado no payload pra não restar dúvida no cliente.
      defensorControladoPorIA: true,
      ratingDefensorInalterado: duelo.ratingAntes[duelo.ia],
    });
  }

  for (const socketId of io.sockets.adapter.rooms.get(duelo.sala) || []) {
    io.sockets.sockets.get(socketId)?.leave(duelo.sala);
  }
}

// Erros de negócio da criação de partida: o controller traduz em HTTP.
class RankedMatchError extends Error {
  constructor(codigo, mensagem, status = 400) {
    super(mensagem);
    this.codigo = codigo;
    this.status = status;
  }
}

// §6 — cria e inicia a partida assíncrona. Chamado pelo controller
// (POST /api/pvp/ranked/match/start), NUNCA por evento de socket vindo
// do cliente: assim o id do desafiante vem sempre da sessão autenticada.
//
// Ordem importa (§6/§11): seleciona o oponente ANTES de consumir a
// tentativa diária — sem candidato elegível, nada é gasto.
async function iniciarPartidaAssincrona(io, { idDesafiante }) {
  const chaveDesafiante = pvpLiveSocket.chaveOnline(idDesafiante);

  if (!pvpLiveSocket.online.has(chaveDesafiante)) {
    throw new RankedMatchError(
      "socket-offline",
      "Conecte-se à Arena antes de iniciar uma partida ranqueada.",
      400,
    );
  }
  if (pvpLiveSocket.duelPorPersonagem.has(chaveDesafiante)) {
    throw new RankedMatchError("ja-em-duelo", "Você já está em um duelo.", 409);
  }
  // §16 — exclusão mútua entre as três experiências: quem tem série de
  // torneio em ready check ou em andamento não inicia ranqueada. O
  // estado de torneio é persistido, então vale mesmo depois de restart.
  if (await tournamentService.emSerieAtiva(idDesafiante)) {
    throw new RankedMatchError(
      "em-torneio",
      "Você tem uma série de torneio em andamento. Termine-a antes de jogar ranqueada.",
      409,
    );
  }

  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  const participacao = await rankedRatingService.obterOuCriarParticipacao(idDesafiante, temporada.id);
  const personagem = await Character.findByPk(idDesafiante, { attributes: ["id", "nivel"] });
  const dateKey = rankedDailyLimitService.chaveDoDia();

  const oponente = await rankedOpponentSelectionService.selecionarOponente({
    idDesafiante,
    ratingDesafiante: participacao.rating,
    nivelDesafiante: personagem?.nivel ?? 1,
    seasonId: temporada.id,
    dateKey,
  });

  if (!oponente) {
    // §6 — sem oponente elegível NÃO consome tentativa diária.
    throw new RankedMatchError(
      "sem-oponente",
      "Nenhum oponente elegível no seu Tier agora. Tente novamente mais tarde.",
      409,
    );
  }

  log("oponente:selecionado", {
    desafiante: idDesafiante,
    ratingDesafiante: participacao.rating,
    tierDesafiante: rankedTierService.tierDivisaoParaRating(participacao.rating).label,
    defensor: oponente.characterId,
    ratingDefensor: oponente.rating,
    tierDefensor: oponente.tierLabel,
    ...oponente.motivo,
  });

  // §11 — a tentativa só é gasta agora, com oponente em mãos e logo
  // antes de criar a partida de verdade.
  const uso = await rankedDailyLimitService.consumirTentativa(idDesafiante, { data: new Date() });
  if (!uso.consumiu) {
    throw new RankedMatchError(
      "limite-diario",
      `Você já usou suas ${uso.limite} partidas ranqueadas de hoje. Volte amanhã.`,
      429,
    );
  }
  log("limite-diario:consumido", { desafiante: idDesafiante, ...uso });

  let partida = null;
  try {
    // Proezas Únicas §11 — Ranked bloqueia Legado (Power UNIQUE_FEAT)
    // pros DOIS lados, nunca só o desafiante: se o defensor snapshot
    // também tiver um, o enforcement em carregarLutador some com ele do
    // loadout igual faria com o desafiante.
    const [lutadorA, lutadorB] = await Promise.all([
      pvpLiveSocket.carregarLutador(idDesafiante, { contexto: "RANKED" }),
      // §6 — snapshot COMPLETO do defensor no estado atual dele
      // (atributos, equipamento/refinamento, habilidades, passivas):
      // carregarLutador é exatamente o mesmo carregamento do duelo ao
      // vivo, então o build dele é representado do mesmo jeito.
      pvpLiveSocket.carregarLutador(oponente.characterId, { contexto: "RANKED" }),
    ]);
    if (!lutadorA || !lutadorB) throw new Error("Personagem não encontrado ao montar partida ranqueada.");

    partida = await RankedMatch.create({
      season_id: temporada.id,
      id_jogador1: idDesafiante,
      id_jogador2: oponente.characterId,
      rating_jogador1_antes: participacao.rating,
      rating_jogador2_antes: oponente.rating,
      defensor_controlado_por_ia: true,
      date_key: uso.dateKey,
      status: "EmAndamento",
      iniciada_em: new Date(),
    });

    const duelId = pvpLiveSocket.alocarDuelId();
    const sala = `ranked:${duelId}`;
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
      timerIA: null,
      ranked: true,
      assincrono: true,
      ia: "B", // o defensor é SEMPRE o lado B numa partida assíncrona
      desafianteId: idDesafiante,
      defensorId: oponente.characterId,
      seasonId: temporada.id,
      rankedMatchId: partida.id,
      dateKey: uso.dateKey,
      ratingAntes: { A: participacao.rating, B: oponente.rating },
      finalizar: finalizarDueloRanked,
      aoDesconectar: aoDesconectarRanked,
      aoReconectar: aoReconectarRanked,
      aoTrocarTurno: agendarTurnoIA,
    };

    pvpLiveSocket.duelos.set(duelId, duelo);
    // Só o humano fica marcado como "em duelo": o defensor está offline
    // (ou jogando outra coisa) e não pode ser travado por uma partida
    // que não é dele (§8/§16 — exclusividade vale por quem está de fato
    // em combate).
    pvpLiveSocket.duelPorPersonagem.set(chaveDesafiante, duelId);

    const socketA = io.sockets.sockets.get(pvpLiveSocket.online.get(chaveDesafiante));
    socketA?.join(sala);

    io.to(sala).emit("ranked:match:found", {
      duelId,
      desafiante: { id: lutadorA.id, nome: lutadorA.nome, rating: participacao.rating },
      defensor: {
        id: lutadorB.id,
        nome: lutadorB.nome,
        rating: oponente.rating,
        controladoPorIA: true,
      },
    });
    io.to(sala).emit("ranked:match:start", montarPayloadInicio(duelo));

    log("partida:inicio", {
      duelId,
      rankedMatchId: partida.id,
      desafiante: idDesafiante,
      ratingDesafiante: participacao.rating,
      defensor: oponente.characterId,
      ratingDefensor: oponente.rating,
      primeiro,
    });

    pvpLiveSocket.iniciarTimerDeTurno(io, duelId);
    // Se a IA começa jogando, o gancho de troca de turno ainda não
    // rodou (nenhum turno foi executado) — agenda explicitamente.
    agendarTurnoIA(io, duelId, primeiro);

    return {
      duelId,
      rankedMatchId: partida.id,
      temporada,
      uso,
      desafiante: {
        id: idDesafiante,
        rating: participacao.rating,
        ...rankedTierService.resumoTier(participacao.rating),
      },
      defensor: {
        id: oponente.characterId,
        nome: oponente.nome,
        nivel: oponente.nivel,
        controladoPorIA: true,
        ...rankedTierService.resumoTier(oponente.rating),
      },
    };
  } catch (error) {
    // §11 — falha comprovada do servidor ANTES de um resultado válido
    // devolve a tentativa.
    console.error("[ranked] Erro ao criar partida assíncrona — estornando tentativa:", error);
    await rankedDailyLimitService
      .devolverTentativa(idDesafiante, { dateKey: uso.dateKey })
      .catch((erroEstorno) => console.error("[ranked] Falha ao estornar tentativa:", erroEstorno));
    log("limite-diario:estornado", { desafiante: idDesafiante, motivo: "falha-ao-criar-partida" });

    if (partida) {
      await RankedMatch.update(
        { status: "Finalizada", motivo_encerramento: "FalhaServidor", encerrada_em: new Date() },
        { where: { id: partida.id, status: "EmAndamento" } },
      ).catch(() => {});
    }
    throw new RankedMatchError(
      "falha-servidor",
      "Não foi possível iniciar a partida ranqueada. Sua tentativa foi devolvida.",
      500,
    );
  }
}

// Partidas "EmAndamento" que ninguém mais vai terminar: ou o processo
// reiniciou (o estado do duelo vivia só em memória) ou
// finalizarDueloRanked tentou persistir e a transaction falhou — nos
// dois casos o duelo já não existe mais em pvpLiveSocket.duelos (essa é
// EXATAMENTE a garantia que este filtro usa pra nunca varrer uma
// partida que ainda está sendo jogada de verdade neste mesmo processo).
// Marca como falha de servidor e devolve a tentativa (§11) — nunca
// inventa um resultado que não temos mais como confirmar.
//
// `idadeMinimaMs` é uma segunda rede de segurança, redundante com a
// checagem acima, só pra nunca varrer uma partida iniciada há poucos
// segundos por alguma janela de corrida entre o INSERT e o registro em
// `duelos` (MAX_ACOES=80 × PRAZO_TURNO_MS=5s ≈ 6,7min no pior caso
// realista — 10min dá margem confortável sem herdar aquele número
// mágico de outro módulo).
const IDADE_MINIMA_VARREDURA_MS = 10 * 60 * 1000;

function rankedMatchIdsAindaEmMemoria() {
  const ids = new Set();
  for (const duelo of pvpLiveSocket.duelos.values()) {
    if (duelo.ranked && duelo.rankedMatchId) ids.add(duelo.rankedMatchId);
  }
  return ids;
}

async function encerrarPartidasOrfas() {
  const emMemoria = rankedMatchIdsAindaEmMemoria();
  const limiteIdade = new Date(Date.now() - IDADE_MINIMA_VARREDURA_MS);

  const candidatas = await RankedMatch.findAll({
    where: {
      status: "EmAndamento",
      defensor_controlado_por_ia: true,
      id: { [Op.gt]: 0 },
      iniciada_em: { [Op.lte]: limiteIdade },
    },
  });
  const orfas = candidatas.filter((partida) => !emMemoria.has(partida.id));
  for (const partida of orfas) {
    await sequelize
      .transaction(async (transaction) => {
        await rankedDailyLimitService.devolverTentativa(partida.id_jogador1, {
          transaction,
          dateKey: partida.date_key,
        });
        await partida.update(
          { status: "Finalizada", motivo_encerramento: "FalhaServidor", encerrada_em: new Date() },
          { transaction },
        );
      })
      .catch((error) => console.error("[ranked] Falha ao encerrar partida órfã:", error));
  }
  if (orfas.length > 0) log("partidas-orfas:encerradas", { total: orfas.length });
  return orfas.length;
}

// Bug reportado ("ranking ranqueado não contabiliza"): antes disto
// encerrarPartidasOrfas só rodava UMA VEZ, no boot do processo (ver
// app.js) — pensada só pro caso de restart. Mas uma partida também
// fica travada em "EmAndamento" pra sempre quando finalizarDueloRanked
// tenta persistir o resultado e a transaction falha por qualquer
// motivo transitório (o duelo já saiu da memória antes dessa tentativa,
// então não há segunda chance no mesmo processo — ver o comentário em
// pvpLiveSocket.executarTurno). Sem um processo novo, essa partida (e o
// jogador que a jogou) ficava sem contabilizar até o próximo deploy —
// podia ser horas ou dias. Rodar a cada poucos minutos encurta essa
// janela pra "no máximo alguns minutos" em vez de "até o próximo
// restart". `.unref()` — nunca impede o processo de encerrar sozinho
// (mesmo padrão de worldBossScheduler.js).
const INTERVALO_VARREDURA_ORFAS_MS = 3 * 60 * 1000;
let intervaloVarreduraOrfas = null;

function iniciarVarredorDePartidasOrfas() {
  if (intervaloVarreduraOrfas) return;
  encerrarPartidasOrfas().catch((error) => console.error("[ranked] falha na varredura inicial de partidas órfãs:", error));
  intervaloVarreduraOrfas = setInterval(() => {
    encerrarPartidasOrfas().catch((error) => console.error("[ranked] falha na varredura periódica de partidas órfãs:", error));
  }, INTERVALO_VARREDURA_ORFAS_MS);
  intervaloVarreduraOrfas.unref?.();
}

module.exports = function registerRankedLiveHandlers(io) {
  io.on("connection", (socket) => {
    // Sem "identificar" próprio: reaproveita socket.characterId setado
    // pelo "identificar" de pvpLiveSocket.js na MESMA conexão.
    //
    // DEPRECATED (PvP v2 §19): os eventos de fila ranqueada
    // ("ranked:queue:join"/"ranked:queue:leave") não existem mais — o
    // matchmaking por fila foi substituído por POST
    // /api/pvp/ranked/match/start. Respondidos explicitamente pra um
    // cliente antigo receber um erro claro em vez de silêncio.
    for (const eventoAntigo of ["ranked:queue:join", "ranked:queue:leave"]) {
      socket.on(eventoAntigo, () => {
        socket.emit("pvp:erro", {
          mensagem:
            "A fila ranqueada foi removida. Use POST /api/pvp/ranked/match/start para iniciar uma partida.",
        });
      });
    }
  });
};

module.exports.finalizarDueloRanked = finalizarDueloRanked;
module.exports.iniciarPartidaAssincrona = iniciarPartidaAssincrona;
module.exports.encerrarPartidasOrfas = encerrarPartidasOrfas;
module.exports.iniciarVarredorDePartidasOrfas = iniciarVarredorDePartidasOrfas;
module.exports.RankedMatchError = RankedMatchError;
module.exports.montarPayloadInicio = montarPayloadInicio;
