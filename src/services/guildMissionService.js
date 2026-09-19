// Missões da Guilda (spec "Aprimoramento do Sistema de Guildas" §5-§13/
// §52/§56/§57) — UMA missão ativa por categoria por guilda por ciclo
// (nunca uma lista de ofertas como na Guilda dos Aventureiros, §10:
// "a Guilda possui um quadro comum"), progresso individual por membro,
// sem etapa de aceitar (§7) e sem etapa de resgatar — a recompensa
// (XP de Guilda + pontos de Contribuição) é concedida automaticamente
// no exato momento em que o membro bate a meta, exatamente uma vez por
// missão/ciclo (§6/§57, via GuildMemberMissionProgress.xp_concedida).
const crypto = require("crypto");
const GuildMember = require("../models/GuildMember");
const Guild = require("../models/Guild");
const GuildMission = require("../models/GuildMission");
const GuildMissionCycle = require("../models/GuildMissionCycle");
const GuildMemberMissionProgress = require("../models/GuildMemberMissionProgress");
const GuildLog = require("../models/GuildLog");
const { concederExperiencia } = require("./guildXpService");
const { pontuarContribuicao } = require("./guildContributionService");
const {
  inicioDoCicloDiario,
  inicioDoCicloSemanal,
  inicioDoCicloMensal,
  membroEmCarencia,
  REQUISITOS_RANK_GUILDA,
  proximoRankGuilda,
} = require("../config/guildConfig");
const { inicioDaJanelaAtual } = require("../config/adventureGuildConfig");
const { emitParaGuild } = require("../socket/guildSocket");

const CATEGORIAS = ["Diaria", "Semanal", "Mensal", "Rank"];

function cicloInicioDaCategoria(categoria, agora = new Date()) {
  if (categoria === "Semanal") return new Date(inicioDoCicloSemanal(agora));
  if (categoria === "Mensal") return new Date(inicioDoCicloMensal(agora));
  if (categoria === "Rank") return inicioDaJanelaAtual(agora);
  return new Date(inicioDoCicloDiario(agora));
}

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Sorteia (se ainda não existir) a missão ativa de uma categoria pra
// uma guilda no ciclo atual. `rank` só importa pra categoria "Rank".
// Mesmo padrão anti-corrida da Guilda dos Aventureiros: tenta inserir,
// ignora erro de unique constraint (quem perdeu a corrida relê depois).
async function obterCicloAtivo(idGuild, categoria, rankAtual, transaction) {
  const cicloInicio = cicloInicioDaCategoria(categoria);

  const buscar = () =>
    GuildMissionCycle.findOne({
      where: { id_guild: idGuild, categoria, ciclo_inicio: cicloInicio },
      include: [{ model: GuildMission, as: "missao" }],
      transaction,
    });

  let ciclo = await buscar();
  if (ciclo) return ciclo;

  const where = { categoria, ativa: true };
  if (categoria === "Rank") where.rank = rankAtual;
  const pool = await GuildMission.findAll({ where, transaction });
  if (pool.length === 0) return null;

  const escolhida = embaralhar(pool)[0];
  try {
    await GuildMissionCycle.create(
      { id_guild: idGuild, categoria, id_guild_mission: escolhida.id, ciclo_inicio: cicloInicio },
      { transaction },
    );
  } catch (erro) {
    if (erro.name !== "SequelizeUniqueConstraintError") throw erro;
  }
  return buscar();
}

// Quadro completo (uma linha por categoria) pra exibir no frontend,
// já com o progresso do personagem que está olhando.
async function listarQuadro(idGuild, idPersonagem, transaction) {
  const guild = await Guild.findByPk(idGuild, { attributes: ["id", "rank"], transaction });
  if (!guild) return [];

  const linhas = [];
  for (const categoria of CATEGORIAS) {
    const ciclo = await obterCicloAtivo(idGuild, categoria, guild.rank, transaction);
    if (!ciclo || !ciclo.missao) continue;

    const [progresso] = await GuildMemberMissionProgress.findOrCreate({
      where: { id_guild_mission_cycle: ciclo.id, id_personagem: idPersonagem },
      defaults: {},
      transaction,
    });

    const totalConcluidos = await GuildMemberMissionProgress.count({
      where: { id_guild_mission_cycle: ciclo.id, concluida: true },
      transaction,
    });

    linhas.push({
      categoria,
      missao: {
        id: ciclo.missao.id,
        nome: ciclo.missao.nome,
        descricao: ciclo.missao.descricao,
        tipo_objetivo: ciclo.missao.tipo_objetivo,
        meta: ciclo.missao.meta,
        xp_guilda: ciclo.missao.xp_guilda,
        pontos_contribuicao: ciclo.missao.pontos_contribuicao,
      },
      progresso: progresso.progresso,
      concluida: progresso.concluida,
      membros_concluiram: totalConcluidos,
      ciclo_inicio: ciclo.ciclo_inicio,
    });
  }
  return linhas;
}

// Chamado pelos pontos de evento reais do jogo (§56: Aventura/
// Expedição/Forja/PvP), sempre dentro da MESMA transação que gerou o
// evento — mesmo padrão de missionService.registrarProgresso/
// adventureGuildObjectiveService.registrarProgressoContrato.
async function registrarProgressoMissaoGuilda(character, tipo, quantidade, transaction) {
  const membro = await GuildMember.findOne({ where: { id_personagem: character.id }, transaction });
  if (!membro) return;
  // §26 — carência: nada de progresso/XP/contribuição pro recém-entrado.
  if (membroEmCarencia(membro)) return;

  const guild = await Guild.findByPk(membro.id_guild, { transaction, lock: transaction.LOCK.UPDATE });
  if (!guild) return;

  let promocao = null;
  let algumaAtualizacao = false;

  for (const categoria of CATEGORIAS) {
    const ciclo = await obterCicloAtivo(guild.id, categoria, guild.rank, transaction);
    if (!ciclo || !ciclo.missao || ciclo.missao.tipo_objetivo !== tipo) continue;

    const [progresso] = await GuildMemberMissionProgress.findOrCreate({
      where: { id_guild_mission_cycle: ciclo.id, id_personagem: character.id },
      defaults: {},
      transaction,
    });
    if (progresso.xp_concedida) continue;

    progresso.progresso = Math.min(ciclo.missao.meta, progresso.progresso + quantidade);
    if (progresso.progresso >= ciclo.missao.meta) progresso.concluida = true;
    algumaAtualizacao = true;

    if (progresso.concluida) {
      progresso.xp_concedida = true;

      await concederExperiencia(guild, ciclo.missao.xp_guilda);
      guild.experiencia_total_ganha = Number(guild.experiencia_total_ganha) + ciclo.missao.xp_guilda;
      await pontuarContribuicao(guild.id, character.id, ciclo.missao.pontos_contribuicao, transaction);

      if (categoria === "Rank") {
        guild.missoes_rank_concluidas_no_rank_atual += 1;
        const requisito = REQUISITOS_RANK_GUILDA[guild.rank];
        if (requisito && guild.missoes_rank_concluidas_no_rank_atual >= requisito) {
          const proximo = proximoRankGuilda(guild.rank);
          if (proximo) {
            promocao = { de: guild.rank, para: proximo };
            guild.rank = proximo;
            guild.missoes_rank_concluidas_no_rank_atual = 0;
          }
        }
        await GuildLog.create(
          {
            id_guild: guild.id,
            tipo: "missao_guilda_concluida",
            id_personagem_responsavel: character.id,
            detalhes: `Missão de Rank "${ciclo.missao.nome}" concluída (+${ciclo.missao.xp_guilda} XP de Guilda).`,
          },
          { transaction },
        );
      }
    }

    await progresso.save({ transaction });
  }

  if (promocao) {
    await GuildLog.create(
      {
        id_guild: guild.id,
        tipo: "rank_guilda_promovido",
        detalhes: `Guilda promovida de Rank ${promocao.de} para ${promocao.para}.`,
      },
      { transaction },
    );
  }

  if (algumaAtualizacao) {
    await guild.save({ transaction });
    emitParaGuild(guild.id, "guild:mission:update", { idGuild: guild.id });
    if (promocao) emitParaGuild(guild.id, "guild:rank:update", { rank: guild.rank });
  }
}

module.exports = { listarQuadro, registrarProgressoMissaoGuilda, obterCicloAtivo };
