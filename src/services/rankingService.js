// Ranking v2 — todas as 5 categorias (§2 da spec). Controller só chama
// isto e monta a resposta; toda ordenação/filtro/paginação é
// server-authoritative (§25). "Sua posição" é sempre uma query
// separada (§19) — nunca exige carregar o ranking inteiro.
const { Op } = require("sequelize");
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Guild = require("../models/Guild");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const { estaOnline } = require("../socket/pvpLiveSocket");
const { obterOuIniciarTemporadaAtiva } = require("./rankedSeasonService");
const { LEADERBOARD_MINIMO_PARTIDAS } = require("../config/rankedConfig");
const { TAMANHO_PAGINA_PADRAO } = require("../config/rankingConfig");

function paginar(page) {
  const pagina = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (pagina - 1) * TAMANHO_PAGINA_PADRAO;
  return { pagina, offset, limite: TAMANHO_PAGINA_PADRAO };
}

function paginaDeResposta(pagina, limite, totalItens, itens) {
  return { itens, pagina, totalPaginas: Math.max(1, Math.ceil(totalItens / limite)), totalItens };
}

// ---------------------------------------------------------------
// Nível (§5) — maior nível, desempate por XP total, depois id (só pra
// estabilizar a ordenação, sem significado competitivo — §5).
// ---------------------------------------------------------------
async function rankingNivel(page) {
  const { pagina, offset, limite } = paginar(page);
  const { count, rows } = await Character.findAndCountAll({
    attributes: ["id", "nome", "nivel", "experiencia"],
    order: [
      ["nivel", "DESC"],
      ["experiencia", "DESC"],
      ["id", "ASC"],
    ],
    limit: limite,
    offset,
  });

  const itens = rows.map((c, indice) => ({
    posicao: offset + indice + 1,
    id: c.id,
    nome: c.nome,
    nivel: c.nivel,
    online: estaOnline(c.id),
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoNivel(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, { attributes: ["nivel", "experiencia"] });
  if (!personagem) return null;

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "Characters"
     WHERE nivel > :nivel OR (nivel = :nivel AND experiencia > :experiencia);`,
    { replacements: { nivel: personagem.nivel, experiencia: personagem.experiencia } },
  );
  return linhas[0].count + 1;
}

// ---------------------------------------------------------------
// Gold (§6) — ouro TOTAL já ganho (dinheiro_total_ganho), nunca o
// saldo atual: gastar em Forja/Mercado/equipamento não derruba posição.
// ---------------------------------------------------------------
async function rankingGold(page) {
  const { pagina, offset, limite } = paginar(page);
  const { count, rows } = await Character.findAndCountAll({
    attributes: ["id", "nome", "dinheiro_total_ganho"],
    order: [
      ["dinheiro_total_ganho", "DESC"],
      ["id", "ASC"],
    ],
    limit: limite,
    offset,
  });

  const itens = rows.map((c, indice) => ({
    posicao: offset + indice + 1,
    id: c.id,
    nome: c.nome,
    dinheiro_total_ganho: c.dinheiro_total_ganho,
    online: estaOnline(c.id),
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoGold(idPersonagem) {
  const personagem = await Character.findByPk(idPersonagem, { attributes: ["dinheiro_total_ganho"] });
  if (!personagem) return null;

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "Characters" WHERE dinheiro_total_ganho > :valor;`,
    { replacements: { valor: personagem.dinheiro_total_ganho } },
  );
  return linhas[0].count + 1;
}

// ---------------------------------------------------------------
// Guilda (§7) — só guildas Ativas, exclusivamente por XP total.
// ---------------------------------------------------------------
async function rankingGuilda(page) {
  const { pagina, offset, limite } = paginar(page);
  // "Aprimoramento do Sistema de Guildas" §42 introduziu
  // experiencia_total_ganha exatamente pra isso — nunca diminui (ao
  // contrário de `experiencia`, que reseta a cada nível), então é o
  // critério certo pra métrica histórica de ranking.
  const { count, rows } = await Guild.findAndCountAll({
    where: { status: "Ativa" },
    attributes: ["id", "nome", "experiencia", "experiencia_total_ganha"],
    order: [
      ["experiencia_total_ganha", "DESC"],
      ["id", "ASC"],
    ],
    limit: limite,
    offset,
  });

  const itens = rows.map((g, indice) => ({
    posicao: offset + indice + 1,
    id: g.id,
    nome: g.nome,
    experiencia: g.experiencia,
    experiencia_total_ganha: g.experiencia_total_ganha,
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoGuilda(idGuild) {
  if (!idGuild) return null;
  const guild = await Guild.findByPk(idGuild, { attributes: ["experiencia_total_ganha", "status"] });
  if (!guild || guild.status !== "Ativa") return null;

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "Guilds" WHERE status = 'Ativa' AND experiencia_total_ganha > :xp;`,
    { replacements: { xp: guild.experiencia_total_ganha } },
  );
  return linhas[0].count + 1;
}

// ---------------------------------------------------------------
// Boss da Guilda ("Aprimoramento do Sistema de Guildas" §40/§41) —
// ordenado por bosses_derrotados_total; desempate: maior Rank atual >
// maior XP total histórico > id (critério técnico determinístico).
// Rank é string (F..S) — usa um CASE pra ordenar pela posição na
// escada, não alfabeticamente (senão "S" < "A" na ordem errada).
// ---------------------------------------------------------------
const CASE_ORDEM_RANK = `CASE rank
  WHEN 'S' THEN 6 WHEN 'A' THEN 5 WHEN 'B' THEN 4
  WHEN 'C' THEN 3 WHEN 'D' THEN 2 WHEN 'E' THEN 1 ELSE 0 END`;

async function rankingBoss(page) {
  const { pagina, offset, limite } = paginar(page);

  const [linhasContagem] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "Guilds" WHERE status = 'Ativa' AND bosses_derrotados_total > 0;`,
  );
  const totalItens = linhasContagem[0].count;

  const [linhas] = await sequelize.query(
    `SELECT id, nome, rank, bosses_derrotados_total, experiencia_total_ganha
     FROM "Guilds"
     WHERE status = 'Ativa' AND bosses_derrotados_total > 0
     ORDER BY bosses_derrotados_total DESC, ${CASE_ORDEM_RANK} DESC, experiencia_total_ganha DESC, id ASC
     LIMIT :limite OFFSET :offset;`,
    { replacements: { limite, offset } },
  );

  const itens = linhas.map((linha, indice) => ({
    posicao: offset + indice + 1,
    id: linha.id,
    nome: linha.nome,
    rank: linha.rank,
    bosses_derrotados_total: linha.bosses_derrotados_total,
  }));

  return paginaDeResposta(pagina, limite, totalItens, itens);
}

async function posicaoBoss(idGuild) {
  if (!idGuild) return null;
  const guild = await Guild.findByPk(idGuild, {
    attributes: ["rank", "bosses_derrotados_total", "experiencia_total_ganha", "status"],
  });
  if (!guild || guild.status !== "Ativa" || guild.bosses_derrotados_total <= 0) return null;

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "Guilds"
     WHERE status = 'Ativa' AND bosses_derrotados_total > 0 AND (
       bosses_derrotados_total > :bosses
       OR (bosses_derrotados_total = :bosses AND ${CASE_ORDEM_RANK} > :ordemRank)
       OR (bosses_derrotados_total = :bosses AND ${CASE_ORDEM_RANK} = :ordemRank AND experiencia_total_ganha > :xp)
     );`,
    {
      replacements: {
        bosses: guild.bosses_derrotados_total,
        ordemRank: ["F", "E", "D", "C", "B", "A", "S"].indexOf(guild.rank),
        xp: guild.experiencia_total_ganha,
      },
    },
  );
  return linhas[0].count + 1;
}

// ---------------------------------------------------------------
// Forja (§16) — nível é só exibido; o critério de ordenação é
// exclusivamente XP total (diferencia dois Mestres Ferreiros nível 10).
// ---------------------------------------------------------------
async function rankingForja(page) {
  const { pagina, offset, limite } = paginar(page);
  const { count, rows } = await CharacterForgeProgress.findAndCountAll({
    attributes: ["id_personagem", "nivel", "experiencia"],
    include: [{ model: Character, attributes: ["id", "nome"] }],
    order: [
      ["experiencia", "DESC"],
      ["id_personagem", "ASC"],
    ],
    limit: limite,
    offset,
  });

  const itens = rows.map((f, indice) => ({
    posicao: offset + indice + 1,
    id: f.id_personagem,
    nome: f.Character?.nome ?? "???",
    forja_nivel: f.nivel,
    forja_xp: f.experiencia,
    online: estaOnline(f.id_personagem),
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoForja(idPersonagem) {
  const progresso = await CharacterForgeProgress.findByPk(idPersonagem, { attributes: ["experiencia"] });
  if (!progresso) return null;

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM character_forge_progress WHERE experiencia > :xp;`,
    { replacements: { xp: progresso.experiencia } },
  );
  return linhas[0].count + 1;
}

// ---------------------------------------------------------------
// PvP — o Ranking geral (aba "PvP") reflete exclusivamente a Arena
// Ranqueada (rating Elo da temporada ativa), nunca o Duelo casual: o
// casual é só pra jogar sem compromisso, não conta pra troféu/posição
// nenhuma. Pontuação exibida = rating da temporada. Mesmo mínimo de
// partidas do leaderboard ranqueado (rankedConfig.LEADERBOARD_MINIMO_
// PARTIDAS) pra entrar no Top, pra não expor rating de placement cedo
// demais. Desempate: rating > vitórias > menos jogos.
// ---------------------------------------------------------------
async function rankingPvp(page) {
  const { pagina, offset, limite } = paginar(page);
  const temporada = await obterOuIniciarTemporadaAtiva();

  const { count, rows } = await CharacterPvpSeason.findAndCountAll({
    where: { season_id: temporada.id, jogos: { [Op.gte]: LEADERBOARD_MINIMO_PARTIDAS } },
    include: [{ model: Character, as: "personagem", attributes: ["id", "nome"] }],
    order: [
      ["rating", "DESC"],
      ["vitorias", "DESC"],
      ["jogos", "ASC"],
    ],
    limit: limite,
    offset,
  });

  const itens = rows.map((linha, indice) => ({
    posicao: offset + indice + 1,
    id: linha.character_id,
    nome: linha.personagem?.nome ?? "???",
    pontuacao: linha.rating,
    vitorias: linha.vitorias,
    derrotas: linha.derrotas,
    saldo: linha.vitorias - linha.derrotas,
    combates: linha.jogos,
    online: estaOnline(linha.character_id),
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoPvp(idPersonagem) {
  const temporada = await obterOuIniciarTemporadaAtiva();
  const participacao = await CharacterPvpSeason.findOne({
    where: { character_id: idPersonagem, season_id: temporada.id },
  });

  const naoClassificado = {
    elegivel: false,
    motivo: `Ainda não classificado. Jogue pelo menos ${LEADERBOARD_MINIMO_PARTIDAS} partidas na Arena Ranqueada nesta temporada (o Duelo casual não conta pro ranking).`,
    vitorias: participacao?.vitorias ?? 0,
    derrotas: participacao?.derrotas ?? 0,
    saldo: (participacao?.vitorias ?? 0) - (participacao?.derrotas ?? 0),
    combates: participacao?.jogos ?? 0,
  };

  if (!participacao || participacao.jogos < LEADERBOARD_MINIMO_PARTIDAS) {
    return naoClassificado;
  }

  // Mesma comparação de tupla usada no ORDER BY do ranking, só que aqui
  // conta quantos ficariam ANTES de mim — evita carregar o ranking
  // inteiro só pra achar minha posição (§19).
  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM character_pvp_seasons cps
     WHERE cps.season_id = :seasonId AND cps.jogos >= :minimo
       AND (
         cps.rating > :rating
         OR (cps.rating = :rating AND cps.vitorias > :vitorias)
         OR (cps.rating = :rating AND cps.vitorias = :vitorias AND cps.jogos < :jogos)
       );`,
    {
      replacements: {
        seasonId: temporada.id,
        minimo: LEADERBOARD_MINIMO_PARTIDAS,
        rating: participacao.rating,
        vitorias: participacao.vitorias,
        jogos: participacao.jogos,
      },
    },
  );

  return {
    elegivel: true,
    posicao: linhas[0].count + 1,
    pontuacao: participacao.rating,
    vitorias: participacao.vitorias,
    derrotas: participacao.derrotas,
    saldo: participacao.vitorias - participacao.derrotas,
    combates: participacao.jogos,
  };
}

module.exports = {
  rankingNivel,
  posicaoNivel,
  rankingGold,
  posicaoGold,
  rankingGuilda,
  posicaoGuilda,
  rankingForja,
  posicaoForja,
  rankingPvp,
  posicaoPvp,
  rankingBoss,
  posicaoBoss,
};
