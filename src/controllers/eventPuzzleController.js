// Evento "O Coração da Máquina Celestial" — Fase 1. API do jogador —
// superfície mínima (seção 11 da encomenda): listar edições ativas,
// criar/obter a própria PuzzleInstance, consultar estado público.
// Nenhum endpoint de manipulação de engrenagem/espelho/válvula ainda —
// isso é Fase 2+. Identidade sempre de req.personagemAtual (nunca de
// characterId/participantId enviado pelo cliente — seção 12).
const eventEditionService = require("../services/eventEditionService");
const puzzleInstanceService = require("../services/puzzleInstanceService");
const puzzleActionService = require("../services/puzzleActionService");
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
    const { instancia, resultado } = await puzzleActionService.executarAcao(
      req.params.id,
      req.personagemAtual.id,
      acao,
      req.body.stateVersion,
    );
    const dto = puzzleInstanceService.dtoRuntime(instancia);
    // Socket.IO só como transporte/feedback pra quem mais estiver
    // olhando essa instância — nunca a autoridade (já persistido acima
    // via aplicarMutacao antes desta linha rodar).
    emitirAtualizacaoDeInstancia(instancia.id, dto, resultado.eventos);
    return res.json({ status: "success", data: { instancia: dto, eventos: resultado.eventos } });
  } catch (error) {
    tratarErro(res, error, "Erro ao executar ação de puzzle:");
  }
};
