// Guilda dos Aventureiros — só valida a requisição e delega pros
// services (§51/§52 da spec). Tudo sai de req.personagemAtual, nunca de
// um characterId vindo do cliente (§38).
const { sequelize } = require("../config/database");
const { listarMissoes, resgatarRecompensa } = require("../services/missionService");
const { obterOfertasDoRank } = require("../services/adventureGuildRotationService");
const {
  aceitarOferta,
  entregarItens,
  resgatarRecompensaContrato,
  listarContratosAtivos,
  expirarContratosVencidos,
} = require("../services/adventureGuildContractService");
const { obterProvacaoAtiva, iniciarProvacao, falharProvacao } = require("../services/adventureGuildTrialService");
const { obterOuCriarProgresso } = require("../services/adventureGuildProgressionService");
const { REQUISITOS_PROMOCAO, COOLDOWN_PROVACAO_MS } = require("../config/adventureGuildConfig");

// Texto legível do objetivo pro jogador — nunca mostra o valor cru do
// ENUM tipo_objetivo (era o bug: "5x (MatarMonstroEspecifico)" sem
// nem dizer qual monstro).
function formatarObjetivo(missao) {
  const qtd = missao.quantidade_objetivo;
  const sufixoQualidade = missao.qualidade_minima ? ` (qualidade mínima: ${missao.qualidade_minima})` : "";

  switch (missao.tipo_objetivo) {
    case "MatarMonstroEspecifico":
      return `Matar ${qtd}x ${missao.monstroAlvo?.nome ?? "monstro desconhecido"}`;
    case "MatarNaRegiao":
      return `Matar ${qtd}x em ${missao.areaAlvo?.nome ?? "região desconhecida"}`;
    case "MatarInimigos":
      return `Matar ${qtd}x inimigos`;
    case "VencerDuelos":
      return `Vencer ${qtd}x duelos de PvP`;
    case "GanharOuro":
      return `Ganhar ${qtd} de ouro`;
    case "CompletarExpedicoes":
      return `Completar ${qtd}x Expedições`;
    case "Fabricar":
      return `Fabricar ${qtd}x itens${sufixoQualidade}`;
    case "Refinar":
      return `Refinar ${qtd}x itens${sufixoQualidade}`;
    case "Entregar":
      return `Entregar ${qtd}x ${missao.itemAlvo?.nome ?? "item"}`;
    case "AlcancarNivel":
      return `Alcançar nível ${qtd}`;
    default:
      return `${qtd}x ${missao.tipo_objetivo}`;
  }
}

function formatarOferta(oferta) {
  return {
    id: oferta.id,
    ordem: oferta.ordem,
    missao: formatarMissao(oferta.missao),
  };
}

function formatarMissao(missao) {
  return {
    id: missao.id,
    rank: missao.rank,
    nome: missao.nome,
    descricao: missao.descricao,
    tipo_objetivo: missao.tipo_objetivo,
    descricao_objetivo: formatarObjetivo(missao),
    quantidade_objetivo: missao.quantidade_objetivo,
    qualidade_minima: missao.qualidade_minima,
    id_item_alvo: missao.id_item_alvo,
    recompensas: (missao.recompensas ?? []).map((r) => ({
      tipo: r.tipo,
      quantidade: r.quantidade,
      item: r.item ? { id: r.item.id, nome: r.item.nome, imagem_url: r.item.imagem_url } : null,
    })),
  };
}

function formatarContrato(contrato) {
  return {
    id: contrato.id,
    eh_provacao: contrato.eh_provacao,
    status: contrato.status,
    progresso_atual: contrato.progresso_atual,
    aceito_em: contrato.aceito_em,
    expira_em: contrato.expira_em,
    missao: formatarMissao(contrato.missao),
  };
}

// GET /api/adventure-guild — visão geral (§46).
exports.obterVisaoGeral = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const dados = await sequelize.transaction(async (transaction) => {
      await expirarContratosVencidos(idPersonagem, transaction);
      const progresso = await obterOuCriarProgresso(idPersonagem, transaction);
      const provacaoAtiva = await obterProvacaoAtiva(idPersonagem, transaction);

      let cooldownProvacaoRestanteMs = 0;
      if (progresso.ultima_falha_provacao_em) {
        const liberadaEm = progresso.ultima_falha_provacao_em.getTime() + COOLDOWN_PROVACAO_MS;
        cooldownProvacaoRestanteMs = Math.max(0, liberadaEm - Date.now());
      }

      return {
        rank: progresso.rank,
        missoes_concluidas_no_rank: progresso.missoes_concluidas_no_rank,
        requisito_promocao: REQUISITOS_PROMOCAO[progresso.rank] ?? null,
        apto_para_promocao: progresso.apto_para_promocao,
        provacao_ativa: provacaoAtiva ? formatarContrato(provacaoAtiva) : null,
        cooldown_provacao_restante_ms: cooldownProvacaoRestanteMs,
      };
    });
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter visão geral da Guilda dos Aventureiros:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// GET /api/adventure-guild/daily | weekly | monthly (§6-§8).
function listarMissoesLivresPorCategoria(categoria) {
  return async (req, res) => {
    try {
      const idPersonagem = req.personagemAtual.id;
      const missoes = await sequelize.transaction((transaction) => listarMissoes(idPersonagem, transaction));
      res.status(200).json({
        status: "success",
        data: { missoes: missoes.filter((m) => m.categoria === categoria) },
      });
    } catch (error) {
      console.error(`Erro ao listar missões ${categoria}:`, error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  };
}
exports.listarDiarias = listarMissoesLivresPorCategoria("Diaria");
exports.listarSemanais = listarMissoesLivresPorCategoria("Semanal");
exports.listarMensais = listarMissoesLivresPorCategoria("Mensal");
// §36 — as missões "Unica" (AlcancarNivel) do sistema antigo continuam
// funcionando exatamente como antes; decisão de migração: mantidas
// dentro da própria Guilda como uma seção de Marcos, em vez de criar um
// sistema de conquistas à parte só pra isso.
exports.listarMarcos = listarMissoesLivresPorCategoria("Unica");

// POST /api/adventure-guild/missions/:missionId/claim — resgate das
// missões livres (Diária/Semanal/Mensal), mesmo fluxo de sempre.
exports.resgatarMissaoLivre = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const resultado = await sequelize.transaction((transaction) =>
      resgatarRecompensa(idPersonagem, req.params.missionId, transaction),
    );
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao resgatar missão livre:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// GET /api/adventure-guild/rank — ofertas da rotação atual do Rank do
// personagem + contratos que ele já tem em andamento (§47).
exports.obterQuadroDeRank = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const dados = await sequelize.transaction(async (transaction) => {
      await expirarContratosVencidos(idPersonagem, transaction);
      const progresso = await obterOuCriarProgresso(idPersonagem, transaction);
      const { janelaInicio, proximaJanela, ofertas } = await obterOfertasDoRank(progresso.rank, transaction);
      const contratos = await listarContratosAtivos(idPersonagem, transaction);
      const idsOfertasAceitas = new Set(contratos.map((c) => c.id_offer).filter(Boolean));

      return {
        rank: progresso.rank,
        apto_para_promocao: progresso.apto_para_promocao,
        janela_inicio: janelaInicio,
        proxima_rotacao_em: proximaJanela,
        ofertas: ofertas.map((o) => ({ ...formatarOferta(o), ja_aceita: idsOfertasAceitas.has(o.id) })),
        contratos_ativos: contratos.filter((c) => c.status === "Ativo").map(formatarContrato),
        contratos_concluidos: contratos.filter((c) => c.status === "Concluido").map(formatarContrato),
      };
    });
    res.status(200).json({ status: "success", data: dados });
  } catch (error) {
    console.error("Erro ao obter quadro de contratos de Rank:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/rank/offers/:offerId/accept
exports.aceitarOfertaDeRank = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const contrato = await sequelize.transaction((transaction) =>
      aceitarOferta(idPersonagem, Number.parseInt(req.params.offerId, 10), transaction),
    );
    res.status(201).json({ status: "success", data: { contratoId: contrato.id } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao aceitar oferta de Rank:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/contracts/:contractId/deliver
exports.entregarItensDoContrato = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    await sequelize.transaction((transaction) =>
      entregarItens(idPersonagem, Number.parseInt(req.params.contractId, 10), transaction),
    );
    res.status(200).json({ status: "success" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao entregar itens do contrato:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/contracts/:contractId/claim
exports.resgatarContrato = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const resultado = await sequelize.transaction((transaction) =>
      resgatarRecompensaContrato(idPersonagem, Number.parseInt(req.params.contractId, 10), transaction),
    );
    res.status(200).json({ status: "success", data: resultado });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao resgatar contrato:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// GET /api/adventure-guild/trial
exports.obterProvacao = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const provacao = await sequelize.transaction((transaction) => obterProvacaoAtiva(idPersonagem, transaction));
    res.status(200).json({ status: "success", data: { provacao: provacao ? formatarContrato(provacao) : null } });
  } catch (error) {
    console.error("Erro ao obter Provação:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/trial/start
exports.iniciarProvacaoDoRank = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    const contrato = await sequelize.transaction((transaction) => iniciarProvacao(idPersonagem, transaction));
    res.status(201).json({ status: "success", data: { contratoId: contrato.id } });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao iniciar Provação:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};

// POST /api/adventure-guild/trial/fail — abandonar a Provação ativa
// (única forma de "falhar" nesta primeira versão — ver relatório
// final sobre a decisão).
exports.falharProvacaoDoRank = async (req, res) => {
  try {
    const idPersonagem = req.personagemAtual.id;
    await sequelize.transaction((transaction) => falharProvacao(idPersonagem, transaction));
    res.status(200).json({ status: "success" });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode === 500) console.error("Erro ao falhar Provação:", error);
    res.status(statusCode).json({ message: error.statusCode ? error.message : "Erro interno do servidor." });
  }
};
