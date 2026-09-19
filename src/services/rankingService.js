// Ranking v2 — todas as 5 categorias (§2 da spec). Controller só chama
// isto e monta a resposta; toda ordenação/filtro/paginação é
// server-authoritative (§25). "Sua posição" é sempre uma query
// separada (§19) — nunca exige carregar o ranking inteiro.
const { sequelize } = require("../config/database");
const Character = require("../models/Character");
const Guild = require("../models/Guild");
const PvpStatus = require("../models/PvpStatus");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const { estaOnline } = require("../socket/pvpLiveSocket");
const {
  TAMANHO_PAGINA_PADRAO,
  PVP_MINIMO_COMBATES,
  PVP_BONUS_ATIVIDADE_MAXIMO,
  PVP_DIVISOR_BONUS_ATIVIDADE,
  PVP_PESO_SALDO,
} = require("../config/rankingConfig");

function paginar(page) {
  const pagina = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (pagina - 1) * TAMANHO_PAGINA_PADRAO;
  return { pagina, offset, limite: TAMANHO_PAGINA_PADRAO };
}

function paginaDeResposta(pagina, limite, totalItens, itens) {
  return { itens, pagina, totalPaginas: Math.max(1, Math.ceil(totalItens / limite)), totalItens };
}

function pontuacaoPvp(vitorias, derrotas) {
  const saldo = vitorias - derrotas;
  const combates = vitorias + derrotas;
  const atividade = Math.min(
    PVP_BONUS_ATIVIDADE_MAXIMO,
    Math.floor(combates / PVP_DIVISOR_BONUS_ATIVIDADE),
  );
  return saldo * PVP_PESO_SALDO + atividade;
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
  const { count, rows } = await Guild.findAndCountAll({
    where: { status: "Ativa" },
    attributes: ["id", "nome", "experiencia"],
    order: [
      ["experiencia", "DESC"],
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
  }));

  return paginaDeResposta(pagina, limite, count, itens);
}

async function posicaoGuilda(idGuild) {
  if (!idGuild) return null;
  const guild = await Guild.findByPk(idGuild, { attributes: ["experiencia", "status"] });
  if (!guild || guild.status !== "Ativa") return null;

  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "Guilds" WHERE status = 'Ativa' AND experiencia > :xp;`,
    { replacements: { xp: guild.experiencia } },
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
// PvP (§8-§13) — Pontuação PvP = (saldo × 10) + bônus de atividade
// (floor(combates/5), máx. 30). Só entra no Top quem tem >= 10 combates
// E saldo >= 0 (§9). Desempate na ordem exata do §13.
// ---------------------------------------------------------------
async function rankingPvp(page) {
  const { pagina, offset, limite } = paginar(page);

  const [linhasContagem] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "PvpStatuses"
     WHERE total_batalhas >= :minimo AND (vitorias - derrotas) >= 0;`,
    { replacements: { minimo: PVP_MINIMO_COMBATES } },
  );
  const totalItens = linhasContagem[0].count;

  const [linhas] = await sequelize.query(
    `SELECT
       ps.id_personagem AS id,
       c.nome AS nome,
       ps.vitorias, ps.derrotas, ps.total_batalhas AS combates,
       (ps.vitorias - ps.derrotas) AS saldo,
       ((ps.vitorias - ps.derrotas) * :peso
         + LEAST(:bonusMax, FLOOR((ps.vitorias + ps.derrotas) / :divisor))) AS pontuacao
     FROM "PvpStatuses" ps
     JOIN "Characters" c ON c.id = ps.id_personagem
     WHERE ps.total_batalhas >= :minimo AND (ps.vitorias - ps.derrotas) >= 0
     ORDER BY pontuacao DESC, saldo DESC, ps.vitorias DESC, ps.total_batalhas DESC, ps.derrotas ASC, ps.id_personagem ASC
     LIMIT :limite OFFSET :offset;`,
    {
      replacements: {
        minimo: PVP_MINIMO_COMBATES,
        peso: PVP_PESO_SALDO,
        bonusMax: PVP_BONUS_ATIVIDADE_MAXIMO,
        divisor: PVP_DIVISOR_BONUS_ATIVIDADE,
        limite,
        offset,
      },
    },
  );

  const itens = linhas.map((linha, indice) => ({
    posicao: offset + indice + 1,
    id: linha.id,
    nome: linha.nome,
    pontuacao: Number(linha.pontuacao),
    vitorias: linha.vitorias,
    derrotas: linha.derrotas,
    saldo: Number(linha.saldo),
    combates: linha.combates,
    online: estaOnline(linha.id),
  }));

  return paginaDeResposta(pagina, limite, totalItens, itens);
}

async function posicaoPvp(idPersonagem) {
  const status = await PvpStatus.findByPk(idPersonagem);
  if (!status) {
    return {
      elegivel: false,
      motivo: "Ainda não classificado. Complete pelo menos 10 combates PvP e mantenha saldo não negativo.",
    };
  }

  const saldo = status.vitorias - status.derrotas;
  const elegivel = status.total_batalhas >= PVP_MINIMO_COMBATES && saldo >= 0;
  if (!elegivel) {
    return {
      elegivel: false,
      motivo: "Ainda não classificado. Complete pelo menos 10 combates PvP e mantenha saldo não negativo.",
      vitorias: status.vitorias,
      derrotas: status.derrotas,
      saldo,
      combates: status.total_batalhas,
    };
  }

  const pontuacao = pontuacaoPvp(status.vitorias, status.derrotas);

  // Mesma comparação de tupla usada no ORDER BY do ranking (§13), só
  // que aqui conta quantos ficariam ANTES de mim — evita carregar o
  // ranking inteiro só pra achar minha posição (§19).
  const [linhas] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "PvpStatuses" ps
     WHERE ps.total_batalhas >= :minimo AND (ps.vitorias - ps.derrotas) >= 0
       AND (
         ((ps.vitorias - ps.derrotas) * :peso + LEAST(:bonusMax, FLOOR((ps.vitorias + ps.derrotas) / :divisor))),
         (ps.vitorias - ps.derrotas),
         ps.vitorias,
         ps.total_batalhas,
         -ps.derrotas,
         -ps.id_personagem
       ) > (:pontuacao, :saldo, :vitorias, :combates, :derrotasNeg, :idNeg);`,
    {
      replacements: {
        minimo: PVP_MINIMO_COMBATES,
        peso: PVP_PESO_SALDO,
        bonusMax: PVP_BONUS_ATIVIDADE_MAXIMO,
        divisor: PVP_DIVISOR_BONUS_ATIVIDADE,
        pontuacao,
        saldo,
        vitorias: status.vitorias,
        combates: status.total_batalhas,
        derrotasNeg: -status.derrotas,
        idNeg: -idPersonagem,
      },
    },
  );

  return {
    elegivel: true,
    posicao: linhas[0].count + 1,
    pontuacao,
    vitorias: status.vitorias,
    derrotas: status.derrotas,
    saldo,
    combates: status.total_batalhas,
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
  pontuacaoPvp,
};
