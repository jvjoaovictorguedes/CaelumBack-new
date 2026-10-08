// Evento "O Coração da Máquina Celestial" — Fase 1. API do jogador —
// superfície mínima (seção 11 da encomenda): listar edições ativas,
// criar/obter a própria PuzzleInstance, consultar estado público.
// Nenhum endpoint de manipulação de engrenagem/espelho/válvula ainda —
// isso é Fase 2+. Identidade sempre de req.personagemAtual (nunca de
// characterId/participantId enviado pelo cliente — seção 12).
const eventEditionService = require("../services/eventEditionService");
const puzzleInstanceService = require("../services/puzzleInstanceService");

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

// Dobra como "resync" — releitura idempotente do estado atual (nenhum
// estado adicional existe nesta fase que justifique um endpoint
// separado de resync; ver relatório de entrega).
exports.obterInstancia = async (req, res) => {
  try {
    const instancia = await puzzleInstanceService.obterParaPersonagem(req.params.id, req.personagemAtual.id);
    return res.json({ status: "success", data: puzzleInstanceService.dtoRuntime(instancia) });
  } catch (error) {
    tratarErro(res, error, "Erro ao obter PuzzleInstance:");
  }
};
