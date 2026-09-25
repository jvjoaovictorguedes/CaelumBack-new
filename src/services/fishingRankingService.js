// Ranking da Pesca — espelha o padrão de rankingService.js (Ranking v2):
// ordenação/paginação sempre server-authoritative, "minha posição" é
// sempre uma COUNT separada (nunca carrega o ranking inteiro só pra
// achar a posição de quem pediu). Duas categorias:
//   - "total"   : total de peixes capturados (CharacterFishingProgress.
//                 total_capturado) — a métrica principal, nunca cai
//                 (venda/consumo do peixe não apaga a captura histórica).
//   - "biggest" : maior peixe já capturado (MAX(weight_g) em
//                 FishingCatchRecord) — categoria secundária, "o maior
//                 já fisgado", desempatada por quando foi capturado
//                 (mais antigo primeiro, célebre é célebre).
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const CharacterFishingProgress = require("../models/CharacterFishingProgress");
const { TAMANHO_PAGINA_PADRAO } = require("../config/rankingConfig");

function paginar(page) {
  const pagina = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (pagina - 1) * TAMANHO_PAGINA_PADRAO;
  return { pagina, offset, limite: TAMANHO_PAGINA_PADRAO };
}

function paginaDeResposta(pagina, limite, totalItens, itens) {
  return { itens, pagina, totalPaginas: Math.max(1, Math.ceil(totalItens / limite)), totalItens };
}

// --------------------------------------------------------- TOTAL CAPTURADO
async function rankingPescaTotal(page) {
  const { pagina, offset, limite } = paginar(page);
  const { count, rows } = await CharacterFishingProgress.findAndCountAll({
    where: { total_capturado: { [Op.gt]: 0 } },
    attributes: ["id_personagem", "nivel", "total_capturado"],
    include: [{ model: Character, attributes: ["id", "nome"] }],
    order: [
      ["total_capturado", "DESC"],
      ["nivel", "DESC"],
      ["id_personagem", "ASC"],
    ],
    limit: limite,
    offset,
  });

  const itens = rows.map((linha, indice) => ({
    posicao: offset + indice + 1,
    id: linha.id_personagem,
    nome: linha.Character?.nome ?? "???",
    nivel_pesca: linha.nivel,
    total_capturado: linha.total_capturado,
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoPescaTotal(idPersonagem) {
  const progresso = await CharacterFishingProgress.findByPk(idPersonagem, {
    attributes: ["total_capturado", "nivel"],
  });
  if (!progresso || progresso.total_capturado <= 0) {
    return {
      elegivel: false,
      motivo: "Ainda não classificado. Capture pelo menos um peixe para entrar no ranking.",
      total_capturado: progresso?.total_capturado ?? 0,
    };
  }

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM character_fishing_progress
     WHERE total_capturado > :total
        OR (total_capturado = :total AND nivel > :nivel);`,
    { replacements: { total: progresso.total_capturado, nivel: progresso.nivel } },
  );
  return { elegivel: true, posicao: linhas[0].count + 1, total_capturado: progresso.total_capturado };
}

// ------------------------------------------------------------- MAIOR PEIXE
async function rankingPescaMaiorPeixe(page) {
  const { pagina, offset, limite } = paginar(page);

  const [linhasContagem] = await sequelize.query(
    `SELECT COUNT(DISTINCT id_personagem)::int AS count FROM fishing_catch_records;`,
  );
  const totalItens = linhasContagem[0].count;

  // Um registro por personagem: o maior peso dele, desempatado pelo
  // catch mais antigo daquele peso (determinístico, sem depender de id
  // arbitrário do registro).
  const [linhas] = await sequelize.query(
    `SELECT DISTINCT ON (fcr.id_personagem)
        fcr.id_personagem, fcr.weight_g, fcr.caught_at, fcr.id_species, c.nome AS nome_personagem, fsp.key AS especie_key, it.nome AS especie_nome
     FROM fishing_catch_records fcr
     JOIN "Characters" c ON c.id = fcr.id_personagem
     LEFT JOIN fishing_species fsp ON fsp.id = fcr.id_species
     LEFT JOIN "Items" it ON it.id = fsp.id_item
     ORDER BY fcr.id_personagem, fcr.weight_g DESC, fcr.caught_at ASC`,
  );

  linhas.sort((a, b) => b.weight_g - a.weight_g || new Date(a.caught_at) - new Date(b.caught_at));
  const pagina_ = linhas.slice(offset, offset + limite);

  const itens = pagina_.map((linha, indice) => ({
    posicao: offset + indice + 1,
    id: linha.id_personagem,
    nome: linha.nome_personagem ?? "???",
    weight_g: linha.weight_g,
    especie_nome: linha.especie_nome ?? linha.especie_key ?? null,
    caught_at: linha.caught_at,
  }));

  return paginaDeResposta(pagina, limite, totalItens, itens);
}

async function posicaoPescaMaiorPeixe(idPersonagem) {
  const [linhas] = await sequelize.query(
    `SELECT MAX(weight_g)::int AS maior FROM fishing_catch_records WHERE id_personagem = :id;`,
    { replacements: { id: idPersonagem } },
  );
  const maior = linhas[0].maior;
  if (!maior) {
    return { elegivel: false, motivo: "Ainda não classificado. Capture pelo menos um peixe.", weight_g: 0 };
  }

  const [contagem] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM (
       SELECT id_personagem, MAX(weight_g) AS maior FROM fishing_catch_records GROUP BY id_personagem
     ) t WHERE t.maior > :maior;`,
    { replacements: { maior } },
  );
  return { elegivel: true, posicao: contagem[0].count + 1, weight_g: maior };
}

module.exports = {
  rankingPescaTotal,
  posicaoPescaTotal,
  rankingPescaMaiorPeixe,
  posicaoPescaMaiorPeixe,
};
