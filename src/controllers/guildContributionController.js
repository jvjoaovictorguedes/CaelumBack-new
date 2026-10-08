// Contribuição V2 (spec "Tesouro da Guilda V2 + Contribuição V2" §11) —
// ranking por período (semana/mês/histórico) + composição por fonte,
// sempre agregando o ledger imutável GuildContributionEvent (nunca um
// contador resetado por scheduler, §16). O histórico total ("all")
// usa GuildContribution.contribuicao_total porque ele também carrega
// pontos de guildas antigas, anteriores à existência do ledger — a
// composição por fonte nesse caso reflete só o que o ledger já viu
// (desde a V2), podendo não somar exatamente o total em guildas antigas.
//
// A rota legada GET /guilds/:id/contributions (ranking só por
// contribuicao_total, sem período) foi removida — GuildContributionTab.tsx
// foi migrado pra consumir só as rotas abaixo.
const { Op, fn, col } = require("sequelize");
const GuildMember = require("../models/GuildMember");
const GuildContribution = require("../models/GuildContribution");
const GuildContributionEvent = require("../models/GuildContributionEvent");
const Character = require("../models/Character");
const { inicioDoCicloSemanal, inicioDoCicloMensal } = require("../config/guildConfig");

const PERIODOS = new Set(["week", "month", "all"]);

function inicioDoPeriodo(periodo) {
  if (periodo === "week") return new Date(inicioDoCicloSemanal());
  if (periodo === "month") return new Date(inicioDoCicloMensal());
  return null;
}

async function composicaoPorPersonagem(idGuild, inicio) {
  const where = { id_guild: idGuild };
  if (inicio) where.createdAt = { [Op.gte]: inicio };

  const linhas = await GuildContributionEvent.findAll({
    where,
    attributes: ["id_personagem", "source_type", [fn("SUM", col("pontos")), "pontos"]],
    group: ["id_personagem", "source_type"],
    raw: true,
  });

  const porPersonagem = new Map();
  for (const linha of linhas) {
    const idPersonagem = linha.id_personagem;
    if (!porPersonagem.has(idPersonagem)) porPersonagem.set(idPersonagem, { total: 0, composicao: {} });
    const entrada = porPersonagem.get(idPersonagem);
    const pontos = Number(linha.pontos);
    entrada.composicao[linha.source_type] = pontos;
    entrada.total += pontos;
  }
  return porPersonagem;
}

exports.listarPorPeriodo = async (req, res) => {
  try {
    const periodo = PERIODOS.has(req.params.period) ? req.params.period : "all";
    const idGuild = req.params.id;
    const inicio = inicioDoPeriodo(periodo);
    const porPersonagem = await composicaoPorPersonagem(idGuild, inicio);

    let ranking;
    if (periodo === "all") {
      const contribuicoes = await GuildContribution.findAll({
        where: { id_guild: idGuild },
        include: [{ model: Character, attributes: ["id", "nome", "nivel"] }],
      });
      ranking = contribuicoes.map((c) => ({
        personagem: c.Character ? { id: c.Character.id, nome: c.Character.nome, nivel: c.Character.nivel } : null,
        pontos: c.contribuicao_total,
        composicao: porPersonagem.get(c.id_personagem)?.composicao ?? {},
      }));
    } else {
      const idsPersonagens = [...porPersonagem.keys()];
      const personagens = idsPersonagens.length
        ? await Character.findAll({ where: { id: idsPersonagens }, attributes: ["id", "nome", "nivel"] })
        : [];
      const porId = new Map(personagens.map((p) => [p.id, p]));
      ranking = idsPersonagens.map((id) => {
        const entrada = porPersonagem.get(id);
        const personagem = porId.get(id);
        return {
          personagem: personagem ? { id: personagem.id, nome: personagem.nome, nivel: personagem.nivel } : null,
          pontos: entrada.total,
          composicao: entrada.composicao,
        };
      });
    }

    ranking.sort((a, b) => b.pontos - a.pontos);
    return res.status(200).json({ status: "success", data: { periodo, ranking } });
  } catch (error) {
    console.error("Erro ao listar contribuições por período:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};

exports.detalharMembro = async (req, res) => {
  try {
    const idGuild = req.params.id;
    const idPersonagem = req.params.characterId;

    const membro = await GuildMember.findOne({ where: { id_personagem: idPersonagem } });
    if (!membro || membro.id_guild !== Number(idGuild)) {
      return res.status(404).json({ message: "Esse personagem não pertence a essa guilda." });
    }

    const [contribuicao, pontosSemana, pontosMes, composicaoHistorica, ultimoEvento] = await Promise.all([
      GuildContribution.findOne({ where: { id_guild: idGuild, id_personagem: idPersonagem } }),
      GuildContributionEvent.sum("pontos", {
        where: { id_guild: idGuild, id_personagem: idPersonagem, createdAt: { [Op.gte]: new Date(inicioDoCicloSemanal()) } },
      }),
      GuildContributionEvent.sum("pontos", {
        where: { id_guild: idGuild, id_personagem: idPersonagem, createdAt: { [Op.gte]: new Date(inicioDoCicloMensal()) } },
      }),
      GuildContributionEvent.findAll({
        where: { id_guild: idGuild, id_personagem: idPersonagem },
        attributes: ["source_type", [fn("SUM", col("pontos")), "pontos"]],
        group: ["source_type"],
        raw: true,
      }),
      GuildContributionEvent.findOne({
        where: { id_guild: idGuild, id_personagem: idPersonagem },
        order: [["createdAt", "DESC"]],
      }),
    ]);

    const composicao = {};
    for (const linha of composicaoHistorica) composicao[linha.source_type] = Number(linha.pontos);

    return res.status(200).json({
      status: "success",
      data: {
        pontos_semana: pontosSemana ?? 0,
        pontos_mes: pontosMes ?? 0,
        pontos_historico: contribuicao?.contribuicao_total ?? 0,
        composicao,
        ultima_contribuicao: ultimoEvento
          ? { source_type: ultimoEvento.source_type, pontos: ultimoEvento.pontos, createdAt: ultimoEvento.createdAt }
          : null,
      },
    });
  } catch (error) {
    console.error("Erro ao detalhar contribuição do membro:", error);
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
};
