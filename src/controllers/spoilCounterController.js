// Balcão de Espólios — venda, encomendas e Reputação da Guilda dos
// Aventureiros. Mesmo padrão de adventureGuildController.js: só valida
// entrada superficial, delega a regra pros services, formata a
// resposta. Identidade sempre de req.personagemAtual (§2/§9.2 "o
// cliente nunca envia characterId como valor confiável").
const { sequelize } = require("../config/database");
const {
  listarEspolios,
  atualizarPreferencia,
  venderEspolios,
  listarHistoricoDeVendas,
} = require("../services/spoilCounterService");
const { obterCicloAtual } = require("../services/spoilOrderRotationService");
const { entregarEncomenda } = require("../services/spoilOrderService");
const { formatarResumoReputacao } = require("../services/spoilReputationService");
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");

async function obterPontosDeReputacao(idPersonagem, transaction) {
  const progresso = await CharacterAdventureGuildProgress.findOne({
    where: { id_personagem: idPersonagem },
    transaction,
  });
  return progresso?.reputacao_encomendas ?? 0;
}

function formatarLinhaDeVenda(linha) {
  return {
    id: linha.id_item ?? linha.item?.id,
    nome: linha.item?.nome ?? linha.nome ?? null,
    quantidade: linha.quantidade,
    valor_unitario_snapshot: linha.valor_unitario_snapshot,
    total_linha: linha.total_linha,
  };
}

function formatarEncomenda(order) {
  return {
    id: order.id,
    ordem: order.ordem,
    item: order.item
      ? { id: order.item.id, nome: order.item.nome, raridade: order.item.raridade, imagem_url: order.item.imagem_url }
      : null,
    quantidade_exigida: order.quantidade_exigida,
    valor_unitario_snapshot: order.valor_unitario_snapshot,
    valor_base: order.quantidade_exigida * order.valor_unitario_snapshot,
    concluida: order.concluida_em != null,
    concluida_em: order.concluida_em,
    ouro_pago: order.ouro_pago,
    reputacao_paga: order.reputacao_paga,
  };
}

// GET /api/adventure-guild/spoils
exports.obterEspolios = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const espolios = await sequelize.transaction((transaction) => listarEspolios(idPersonagem, transaction));
    res.status(200).json({ status: "success", data: { espolios } });
  } catch (error) {
    console.error("Erro ao listar espólios do Balcão:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// PATCH /api/adventure-guild/spoils/:itemId/preferences
exports.atualizarPreferenciaDeEspolio = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const idItem = Number.parseInt(req.params.itemId, 10);
    const { protegido_venda: protegidoVenda, quantidade_reservada: quantidadeReservada } = req.body;

    const preferencia = await sequelize.transaction((transaction) =>
      atualizarPreferencia(idPersonagem, idItem, { protegidoVenda, quantidadeReservada }, transaction),
    );
    res.status(200).json({
      status: "success",
      data: {
        id_item: idItem,
        protegido_venda: preferencia.protegido_venda,
        quantidade_reservada: preferencia.quantidade_reservada,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao atualizar preferência de espólio:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/spoils/sell
exports.venderEspoliosDoBalcao = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const { linhas, idempotencyKey } = req.body;
    const linhasNormalizadas = Array.isArray(linhas)
      ? linhas.map((l) => ({ itemId: Number.parseInt(l.itemId, 10), quantidade: Number.parseInt(l.quantidade, 10) }))
      : [];

    const resultado = await sequelize.transaction((transaction) =>
      venderEspolios(idPersonagem, linhasNormalizadas, idempotencyKey, transaction),
    );
    res.status(200).json({
      status: "success",
      data: {
        totalOuro: resultado.totalOuro,
        linhas: resultado.linhas.map(formatarLinhaDeVenda),
        repetida: resultado.repetida,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao vender espólios:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// GET /api/adventure-guild/spoils/sales
exports.obterHistoricoDeVendas = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const pagina = Number.parseInt(req.query.page, 10) || 1;
    const resultado = await sequelize.transaction((transaction) =>
      listarHistoricoDeVendas(idPersonagem, { pagina }, transaction),
    );
    res.status(200).json({
      status: "success",
      data: {
        total: resultado.total,
        pagina: resultado.pagina,
        porPagina: resultado.porPagina,
        vendas: resultado.vendas.map((venda) => ({
          id: venda.id,
          total_ouro: venda.total_ouro,
          created_at: venda.createdAt,
          linhas: venda.linhas.map(formatarLinhaDeVenda),
        })),
      },
    });
  } catch (error) {
    console.error("Erro ao listar histórico de vendas:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// GET /api/adventure-guild/spoil-orders
exports.obterEncomendas = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const dados = await sequelize.transaction(async (transaction) => {
      const pontos = await obterPontosDeReputacao(idPersonagem, transaction);
      const { janelaInicio, janelaFim, encomendas, ciclo } = await obterCicloAtual(idPersonagem, transaction);
      const concluidas = encomendas.filter((o) => o.concluida_em != null).length;

      return {
        serverTime: new Date(),
        reputation: formatarResumoReputacao(pontos),
        rotation: {
          startedAt: janelaInicio,
          endsAt: janelaFim,
          completed: concluidas,
          total: encomendas.length,
          setBonusClaimed: ciclo.bonus_lote_concedido,
        },
        orders: encomendas.map(formatarEncomenda),
      };
    });
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter encomendas do Balcão:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/spoil-orders/:orderId/deliver
exports.entregarEncomendaDoBalcao = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const idOrder = Number.parseInt(req.params.orderId, 10);
    const resultado = await sequelize.transaction((transaction) => entregarEncomenda(idPersonagem, idOrder, transaction));
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao entregar encomenda do Balcão:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};
