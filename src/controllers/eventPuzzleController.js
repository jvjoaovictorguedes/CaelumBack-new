// Evento "O Coração da Máquina Celestial" — Fase 1. API do jogador —
// superfície mínima (seção 11 da encomenda): listar edições ativas,
// criar/obter a própria PuzzleInstance, consultar estado público.
// Nenhum endpoint de manipulação de engrenagem/espelho/válvula ainda —
// isso é Fase 2+. Identidade sempre de req.personagemAtual (nunca de
// characterId/participantId enviado pelo cliente — seção 12).
const eventEditionService = require("../services/eventEditionService");
const puzzleBlueprintService = require("../services/puzzleBlueprintService");
const puzzleInstanceService = require("../services/puzzleInstanceService");
const puzzleActionService = require("../services/puzzleActionService");
const puzzleClueService = require("../services/puzzleClueService");
const puzzlePioneerService = require("../services/puzzlePioneerService");
const eventPuzzleBossAttemptService = require("../services/eventPuzzleBossAttemptService");
const { emitirAtualizacaoDeInstancia } = require("../socket/eventPuzzleSocket");

function tratarErro(res, error, mensagemLog) {
  const statusCode = error.statusCode || 500;
  if (statusCode === 500) console.error(mensagemLog, error);
  return res.status(statusCode).json({
    message: error.statusCode ? error.message : "Erro interno do servidor.",
    ...(error.code ? { code: error.code } : {}),
  });
}

exports.listarEdicoesAtivas = async (req, res) => {
  try {
    const edicoes = await eventEditionService.listarAtivasPublicas();
    return res.json({ status: "success", data: edicoes });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar edições ativas de evento:");
  }
};

// Fase 12 — lista as salas (blueprints) de UMA edição, na ordem da
// progressão, com `bloqueado` calculado pro personagem logado e
// `layout` (topologia pra desenhar a cena) só nas desbloqueadas. Até
// aqui o jogador não tinha NENHUM jeito de descobrir idBlueprint nem a
// topologia pra jogar — só via endpoint Admin (achado da auditoria
// pré-Fase-12).
exports.listarBlueprintsPublicos = async (req, res) => {
  try {
    const edicao = await eventEditionService.obterPorId(req.params.editionId);
    const blueprints = await puzzleBlueprintService.listarPublicosPorEdicao(
      edicao.id_event_definition,
      edicao.id,
      req.personagemAtual.id,
    );
    return res.json({ status: "success", data: blueprints });
  } catch (error) {
    tratarErro(res, error, "Erro ao listar salas públicas da edição:");
  }
};

// Idempotente — se o personagem já tem uma PuzzleInstance CREATED/
// ACTIVE desse blueprint nessa edição, devolve ela (200) em vez de
// criar outra; só retorna 201 quando cria de verdade.
exports.criarOuObterInstancia = async (req, res) => {
  try {
    const { instancia, criada } = await puzzleInstanceService.criarOuObterInstancia(
      req.params.editionId,
      req.body.idBlueprint,
      { id: req.personagemAtual.id, nome: req.personagemAtual.nome },
    );
    return res
      .status(criada ? 201 : 200)
      .json({ status: "success", data: puzzleInstanceService.dtoRuntime(instancia) });
  } catch (error) {
    tratarErro(res, error, "Erro ao criar/obter PuzzleInstance:");
  }
};

// Dobra como "resync" — releitura idempotente do estado atual; o
// cliente SEMPRE pode rechamar isso na reconexão em vez de confiar em
// qualquer buffer de socket (seção 8 da encomenda: "reconexão deve
// usar resync pelo estado persistido").
exports.obterInstancia = async (req, res) => {
  try {
    const instancia = await puzzleInstanceService.obterParaPersonagem(req.params.id, req.personagemAtual.id);
    return res.json({ status: "success", data: puzzleInstanceService.dtoRuntime(instancia) });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter PuzzleInstance:");
  }
};

// Fase 8 — ÚNICA porta de entrada pra mover uma PuzzleInstance.
// Identidade sempre de req.personagemAtual (nunca de um personagemId
// no corpo); a ação em si (type/componentId/payload) + stateVersion são
// os únicos dados aceitos do cliente — nunca completed/success/reward
// (puzzleActionService nunca lê esses campos). Protegido pelo mesmo
// Anti-Automation existente (ver eventPuzzleRoutes.js), nunca um
// segundo Action Guard.
exports.executarAcao = async (req, res) => {
  try {
    const acao = {
      type: req.body.type,
      ...(req.body.componentId !== undefined ? { componentId: req.body.componentId } : {}),
      ...(req.body.payload !== undefined ? { payload: req.body.payload } : {}),
    };
    const { instancia, resultado, pistasDesbloqueadas, conquistasPioneiras } = await puzzleActionService.executarAcao(
      req.params.id,
      req.personagemAtual.id,
      acao,
      req.body.stateVersion,
    );
    const dto = puzzleInstanceService.dtoRuntime(instancia);
    // Fase 9 — só os campos públicos da pista (nunca objective_id/
    // trigger_type, que são detalhe interno de catálogo, não conteúdo
    // pro jogador).
    const pistasDto = pistasDesbloqueadas.map((p) => ({ id: p.id, titulo: p.titulo, texto: p.texto }));
    // Fase 10 — feedback de "você acabou de virar Pioneiro disto" pro
    // próprio jogador que conquistou; `.marco` foi anexado por
    // puzzlePioneerService.sincronizarConquistas só pra isto (nunca
    // persistido na linha do claim).
    const conquistasDto = conquistasPioneiras.map((c) => ({
      posicao: c.posicao,
      titulo: c.marco.titulo,
      descricao: c.marco.descricao,
    }));
    // Socket.IO só como transporte/feedback pra quem mais estiver
    // olhando essa instância — nunca a autoridade (já persistido acima
    // via aplicarMutacao antes desta linha rodar).
    emitirAtualizacaoDeInstancia(instancia.id, dto, resultado.eventos, pistasDto, conquistasDto);
    return res.json({
      status: "success",
      data: { instancia: dto, eventos: resultado.eventos, pistasDesbloqueadas: pistasDto, conquistasPioneiras: conquistasDto },
    });
  } catch (error) {
    tratarErro(res, error, "Erro ao executar ação de puzzle:");
  }
};

// Fase 12 — abandono voluntário (achado da auditoria pré-Fase-12:
// "nenhum endpoint existe pra isso"). Mesmo corpo da ação normal
// (stateVersion), nunca aceita status/completed/reward do cliente.
exports.abandonarInstancia = async (req, res) => {
  try {
    const instancia = await puzzleInstanceService.abandonar(
      req.params.id,
      req.personagemAtual.id,
      req.body.stateVersion,
    );
    return res.json({ status: "success", data: puzzleInstanceService.dtoRuntime(instancia) });
  } catch (error) {
    tratarErro(res, error, "Erro ao abandonar PuzzleInstance:");
  }
};

// Fase 13 — status público do Custódio do Meridiano (lore, desbloqueio,
// Poder atual do personagem). Nunca cria tentativa — a luta em si só
// começa pelo socket eventpuzzleboss:entrar (ver eventPuzzleBossSocket.js).
exports.obterStatusDoBoss = async (req, res) => {
  try {
    const status = await eventPuzzleBossAttemptService.obterStatusPublico(req.personagemAtual.id, req.params.editionId);
    return res.json({ status: "success", data: status });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter status do Custódio do Meridiano:");
  }
};

// Fase 9 — Caderno de Investigação do próprio personagem. Pistas
// bloqueadas vêm só com `{id, bloqueada:true}` (ver puzzleClueService.
// obterCaderno) — nunca título/texto/condição de desbloqueio antes da
// hora.
exports.obterCaderno = async (req, res) => {
  try {
    const edicao = await eventEditionService.obterPorId(req.params.editionId);
    const caderno = await puzzleClueService.obterCaderno(req.personagemAtual.id, edicao.id_event_definition);
    return res.json({ status: "success", data: caderno });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter Caderno de Investigação:");
  }
};

// Fase 11 — Hall das Lendas. Diferente do Caderno: nunca gated por
// personagem (nenhum "bloqueada": título/descrição de marco e as
// conquistas em si são sempre públicos, ver puzzlePioneerService).
// `quadro` = agrupado por marco; `feed` = cronológico cross-marco.
exports.obterHallDasLendas = async (req, res) => {
  try {
    const edicao = await eventEditionService.obterPorId(req.params.editionId);
    const [quadro, feed] = await Promise.all([
      puzzlePioneerService.obterQuadroDeHonra(edicao.id_event_definition),
      puzzlePioneerService.obterFeedDeDescobertas(edicao.id_event_definition),
    ]);
    return res.json({ status: "success", data: { quadro, feed } });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter Hall das Lendas:");
  }
};
