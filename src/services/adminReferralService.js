// Painel Administrativo — "Referral" (referrals.view). Somente leitura:
// lista quem foi indicado, por quem, e quantas indicações no total
// aquele indicador já tem (contagem GLOBAL do indicador, não só desta
// página — repete o mesmo número em toda linha do mesmo indicador de
// propósito, é assim que o admin enxerga "esse indicador trouxe N
// pessoas" sem precisar abrir uma tela separada).
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const PAGINA_TAMANHO_PADRAO = 50;

// Uma query só: join do indicado com o indicador + subquery de contagem
// total de indicações do indicador. Evita N+1 (uma contagem por linha)
// e mantém a página inteira consistente com o mesmo snapshot do banco.
async function listarIndicados({ pagina = 1, porPagina = PAGINA_TAMANHO_PADRAO, busca } = {}) {
  const paginaNum = Math.max(1, Number(pagina) || 1);
  const porPaginaNum = Math.min(200, Math.max(1, Number(porPagina) || PAGINA_TAMANHO_PADRAO));
  const offset = (paginaNum - 1) * porPaginaNum;

  const buscaLimpa = busca?.trim();
  const filtroBusca = buscaLimpa ? `%${buscaLimpa}%` : null;

  const whereBusca = filtroBusca
    ? `AND (indicado.username ILIKE :filtroBusca OR indicador.username ILIKE :filtroBusca)`
    : "";

  const linhas = await sequelize.query(
    `
    SELECT
      indicado.id AS indicado_id,
      indicado.username AS indicado_username,
      indicado.email AS indicado_email,
      indicado."dataCriacao" AS indicado_data_criacao,
      indicador.id AS indicador_id,
      indicador.username AS indicador_username,
      (SELECT COUNT(*) FROM users u3 WHERE u3.id_indicado_por = indicador.id) AS indicador_total_indicacoes
    FROM users indicado
    JOIN users indicador ON indicador.id = indicado.id_indicado_por
    WHERE 1=1 ${whereBusca}
    ORDER BY indicado."dataCriacao" DESC
    LIMIT :limit OFFSET :offset;
    `,
    { replacements: { filtroBusca, limit: porPaginaNum, offset }, type: QueryTypes.SELECT },
  );

  const [{ total }] = await sequelize.query(
    `
    SELECT COUNT(*) AS total
    FROM users indicado
    JOIN users indicador ON indicador.id = indicado.id_indicado_por
    WHERE 1=1 ${whereBusca};
    `,
    { replacements: { filtroBusca }, type: QueryTypes.SELECT },
  );

  return {
    total: Number(total),
    pagina: paginaNum,
    porPagina: porPaginaNum,
    totalPaginas: Math.max(1, Math.ceil(Number(total) / porPaginaNum)),
    indicados: linhas.map((linha) => ({
      id: linha.indicado_id,
      username: linha.indicado_username,
      email: linha.indicado_email,
      dataCriacao: linha.indicado_data_criacao,
      indicadoPor: {
        id: linha.indicador_id,
        username: linha.indicador_username,
        totalIndicacoes: Number(linha.indicador_total_indicacoes),
      },
    })),
  };
}

// Resumo pro topo da tela (§ pedido "quantidade de vezes que eles foram
// indicados" — total de contas com indicação e quantos indicadores
// distintos existem), sem precisar carregar a listagem inteira.
async function obterResumo() {
  const [{ total_indicados, total_indicadores }] = await sequelize.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE id_indicado_por IS NOT NULL) AS total_indicados,
      COUNT(DISTINCT id_indicado_por) AS total_indicadores
    FROM users;
    `,
    { type: QueryTypes.SELECT },
  );
  return {
    totalIndicados: Number(total_indicados),
    totalIndicadores: Number(total_indicadores),
  };
}

module.exports = { listarIndicados, obterResumo };
