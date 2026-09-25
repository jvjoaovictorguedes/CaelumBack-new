// Telemetria leve de gameplay da Forja (Painel Administrativo §13) —
// NUNCA usa adminAuditService (isso é auditoria ADMINISTRATIVA, domínio
// diferente). Escrita é best-effort: uma falha aqui nunca pode derrubar
// a transaction de gameplay que a chamou, então cada chamada engole o
// próprio erro e só loga.
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const ForgeOperationMetric = require("../models/ForgeOperationMetric");

async function registrarEvento(dados, transaction) {
  try {
    await ForgeOperationMetric.create(dados, { transaction });
  } catch (error) {
    console.error("[forgeTelemetryService] falha ao registrar evento (não afeta o gameplay):", error);
  }
}

async function getMetricas() {
  const [porTipo24h, porTipo7d, fabricacoesPorBlueprint, fundicaoPorRecursoQualidade, refinoPorAlvo, pergaminhosUsados, goldRemovido] =
    await Promise.all([
      sequelize.query(
        `SELECT tipo_acao, COUNT(*)::int AS total
           FROM forge_operation_metrics WHERE "createdAt" >= now() - interval '24 hours'
          GROUP BY tipo_acao;`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT tipo_acao, COUNT(*)::int AS total
           FROM forge_operation_metrics WHERE "createdAt" >= now() - interval '7 days'
          GROUP BY tipo_acao;`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT fom.id_blueprint, fb.nome, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE fom.qualidade_final IS DISTINCT FROM fom.qualidade_base)::int AS com_upgrade_qualidade
           FROM forge_operation_metrics fom
           LEFT JOIN forge_blueprints fb ON fb.id = fom.id_blueprint
          WHERE fom.tipo_acao = 'Fabricacao'
          GROUP BY fom.id_blueprint, fb.nome
          ORDER BY total DESC LIMIT 20;`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT id_recurso, qualidade_base, COUNT(*)::int AS total
           FROM forge_operation_metrics WHERE tipo_acao = 'Fundicao'
          GROUP BY id_recurso, qualidade_base
          ORDER BY total DESC LIMIT 30;`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT alvo_refinamento AS alvo, COUNT(*)::int AS tentativas,
                COALESCE(AVG(CASE WHEN sucesso THEN 1.0 ELSE 0.0 END), 0)::float AS taxa_sucesso_observada
           FROM forge_operation_metrics WHERE tipo_acao = 'Refinamento'
          GROUP BY alvo_refinamento
          ORDER BY alvo_refinamento ASC;`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT fom.id_item_pergaminho, i.nome, COUNT(*)::int AS total
           FROM forge_operation_metrics fom
           LEFT JOIN "Items" i ON i.id = fom.id_item_pergaminho
          WHERE fom.tipo_acao = 'Refinamento' AND fom.id_item_pergaminho IS NOT NULL
          GROUP BY fom.id_item_pergaminho, i.nome
          ORDER BY total DESC LIMIT 20;`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query(
        `SELECT
            COALESCE(SUM(gold_delta) FILTER (WHERE "createdAt" >= now() - interval '24 hours'), 0)::bigint AS gold_removido_24h,
            COALESCE(SUM(gold_delta) FILTER (WHERE "createdAt" >= now() - interval '7 days'), 0)::bigint AS gold_removido_7d,
            COALESCE(SUM(gold_delta), 0)::bigint AS gold_removido_total
          FROM forge_operation_metrics WHERE tipo_acao = 'Refinamento';`,
        { type: QueryTypes.SELECT },
      ),
    ]);

  return {
    porTipo24h,
    porTipo7d,
    fabricacoesPorBlueprint,
    fundicaoPorRecursoQualidade,
    refinoPorAlvo,
    pergaminhosUsados,
    goldRemovido: goldRemovido[0],
    // Escopo reduzido (relatório final do Painel da Forja) — "materiais
    // consumidos" (linha a linha) e "tempo médio até coleta" não são
    // instrumentados nesta V1: exigiriam um ledger de material por
    // operação e o timestamp real de coleta (hoje só existe iniciado_em/
    // pronto_em na fila, que é destruída ao coletar). Ver relatório.
  };
}

module.exports = { registrarEvento, getMetricas };
