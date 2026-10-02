// Dashboard V2 — "Centro do Aventureiro" (doc "Dashboard V2 — Centro do
// Aventureiro" §11/§12). Agregador de LEITURA: monta um DTO compacto a
// partir dos services/controllers que já existem, sem recalcular NADA
// (regra de arquitetura do doc: "se uma missão muda, a regra continua
// em guildMissionService; se a Forja muda, continua no serviço da
// Forja"). Este arquivo nunca é fonte de verdade de progresso/cooldown/
// status — só lê e resume.
//
// Falha parcial (§13): cada domínio é isolado por um try/catch próprio
// (comFalhaParcial) — se Pesca cair, o resto do resumo continua.
const Message = require("../models/Message");
const Guild = require("../models/Guild");
const characterController = require("../controllers/characterController");
const adventureHuntService = require("./adventureHuntService");
const adventureGuildContractService = require("./adventureGuildContractService");
const forgeService = require("./forgeService");
const playerShopService = require("./playerShopService");
const playerShopDemandService = require("./playerShopDemandService");
const playerShopCommissionService = require("./playerShopCommissionService");
const guildMissionService = require("./guildMissionService");
const guildBossService = require("./guildBossService");
const fishingTournamentService = require("./fishingTournamentService");
const rankedSeasonService = require("./rankedSeasonService");
const worldBossStatusService = require("./worldBossStatusService");
const expeditionService = require("./expeditionService");
const fishingProgressionService = require("./fishingProgressionService");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterAlchemyProgress = require("../models/CharacterAlchemyProgress");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");
const alchemyProgressionService = require("./alchemyProgressionService");

function erro(mensagem, statusCode = 400) {
  return Object.assign(new Error(mensagem), { statusCode });
}

// Nunca deixa um domínio indisponível derrubar o resumo inteiro —
// registra o erro server-side (§13: "registrando erro server-side") e
// devolve `valorPadrao` (null por padrão) pro DTO final.
async function comFalhaParcial(chave, fn, valorPadrao = null) {
  try {
    return await fn();
  } catch (error) {
    console.error(`[dashboardSummaryService] Falha ao montar a seção "${chave}":`, error);
    return valorPadrao;
  }
}

// §6 — desempate ESTÁVEL por (prioridade, ordem de categoria, key) pra
// a tela nunca "pular" item de refresh em refresh quando duas
// prioridades empatam.
const PESO_PRIORIDADE = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const ORDEM_CATEGORIA = [
  "shop",
  "forge",
  "world_boss",
  "guild_boss",
  "hunt",
  "contract",
  "guild_mission",
  "fishing_tournament",
  "expedition",
  "profession",
];
const LIMITE_ATTENTION_ITEMS = 4;

function ordenarComLimite(itens) {
  return itens
    .slice()
    .sort((a, b) => {
      const peso = PESO_PRIORIDADE[a.priority] - PESO_PRIORIDADE[b.priority];
      if (peso !== 0) return peso;
      const ordemCategoria = ORDEM_CATEGORIA.indexOf(a.category) - ORDEM_CATEGORIA.indexOf(b.category);
      if (ordemCategoria !== 0) return ordemCategoria;
      return a.key.localeCompare(b.key);
    })
    .slice(0, LIMITE_ATTENTION_ITEMS);
}

async function buildForCharacter(idPersonagem) {
  const personagem = await characterController.obterPersonagemCompletoParaResumo(idPersonagem);
  if (!personagem) throw erro("Personagem não encontrado.", 404);

  const idGuild = personagem.guilda?.id ?? null;

  const [
    cacada,
    contratos,
    forja,
    loja,
    demandas,
    encomendas,
    missoesGuilda,
    bossGuilda,
    guildaNivel,
    torneioPesca,
    temporadaRanked,
    medalhasRanked,
    worldBoss,
    naoLidas,
    forgeProgress,
    alchemyProgress,
    profissoesExpedicao,
    progressoPesca,
  ] = await Promise.all([
    comFalhaParcial("hunt", () => adventureHuntService.obterEstado(idPersonagem)),
    comFalhaParcial("contracts", () => adventureGuildContractService.listarContratosAtivos(idPersonagem), []),
    comFalhaParcial("forge", () => forgeService.listarFila(idPersonagem)),
    comFalhaParcial("shop", () => playerShopService.obterResumoDaLoja(idPersonagem)),
    comFalhaParcial("shopDemands", () => playerShopDemandService.listarMinhasDemandas(idPersonagem), []),
    comFalhaParcial(
      "shopCommissions",
      () => playerShopCommissionService.listarMinhasEncomendas(idPersonagem),
      { enviadas: [], recebidas: [] },
    ),
    idGuild
      ? comFalhaParcial("guildMissions", () => guildMissionService.listarQuadro(idGuild, idPersonagem), [])
      : Promise.resolve([]),
    idGuild ? comFalhaParcial("guildBoss", () => guildBossService.obterStatus(idGuild)) : Promise.resolve(null),
    idGuild
      ? comFalhaParcial("guildLevel", () => Guild.findByPk(idGuild, { attributes: ["nivel"] }))
      : Promise.resolve(null),
    comFalhaParcial("fishingTournament", async () => {
      const resultado = await fishingTournamentService.obterTorneioAtual();
      if (!resultado.torneio) return resultado;
      const minhaPosicao = await fishingTournamentService.obterMinhaPosicaoTorneio(resultado.torneio.id, idPersonagem);
      return { ...resultado, minhaPosicao };
    }),
    comFalhaParcial("rankedSeason", async () => {
      const temporada = await rankedSeasonService.obterTemporadaAtiva();
      if (!temporada) return null;
      const meuStatus = await CharacterPvpSeason.findOne({
        where: { character_id: idPersonagem, season_id: temporada.id },
        attributes: ["rating", "jogos", "vitorias", "derrotas"],
      });
      return { temporada, meuStatus };
    }),
    comFalhaParcial("rankedMedals", () => rankedSeasonService.medalhasDoPersonagem(idPersonagem)),
    comFalhaParcial("worldBoss", () => worldBossStatusService.obterStatusPublico()),
    comFalhaParcial(
      "messages",
      () => Message.count({ where: { id_destinatario: personagem.id_usuario, lida: false } }),
      0,
    ),
    comFalhaParcial("forgeProgress", () => CharacterForgeProgress.findOne({ where: { id_personagem: idPersonagem } })),
    comFalhaParcial("alchemyProgress", () => CharacterAlchemyProgress.findOne({ where: { id_personagem: idPersonagem } })),
    comFalhaParcial("expedition", () => expeditionService.listarProfissoes(idPersonagem), []),
    comFalhaParcial("fishingProfession", () => fishingProgressionService.obterProgresso(idPersonagem)),
  ]);

  const attentionItems = montarAttentionItems({
    cacada,
    contratos,
    forja,
    demandas,
    encomendas,
    idPersonagem,
    missoesGuilda,
    bossGuilda,
    torneioPesca,
    worldBoss,
  });

  const activities = montarAtividades({ cacada, contratos, forja, demandas, encomendas, torneioPesca });

  return {
    character: {
      id: personagem.id,
      nome: personagem.nome,
      nivel: personagem.nivel,
      experiencia: personagem.experiencia,
      vidaAtual: personagem.vida_atual,
      vidaMaxima: personagem.vida_maxima,
      manaAtual: personagem.mana_atual,
      manaMaxima: personagem.mana_maxima,
      dinheiro: personagem.dinheiro,
      classe: personagem.Class?.nome ?? null,
      avatarKey: personagem.avatar_key ?? null,
      adventurerRank: personagem.adventureGuildProfile?.adventurerRank ?? null,
    },
    attentionItems,
    activities,
    shop: montarResumoLoja({ loja, demandas, encomendas, idPersonagem }),
    journey: {
      adventureGuildRank: personagem.adventureGuildProfile?.adventurerRank ?? null,
    },
    professions: montarProfissoes({ forgeProgress, alchemyProgress, profissoesExpedicao, progressoPesca }),
    guild: idGuild
      ? {
          exists: true,
          id: idGuild,
          nome: personagem.guilda.nome,
          sigla: personagem.guilda.sigla,
          nivel: guildaNivel?.nivel ?? null,
          missionSummary: resumirMissoesGuilda(missoesGuilda),
          bossSummary: resumirBossGuilda(bossGuilda),
        }
      : { exists: false },
    world: {
      worldBoss: worldBoss ?? null,
      fishingTournament: torneioPesca?.torneio ?? null,
      pvpSeason: temporadaRanked?.temporada
        ? {
            id: temporadaRanked.temporada.id,
            nome: temporadaRanked.temporada.nome,
            rating: temporadaRanked.meuStatus?.rating ?? null,
            jogos: temporadaRanked.meuStatus?.jogos ?? 0,
            vitorias: temporadaRanked.meuStatus?.vitorias ?? 0,
            medalhas: medalhasRanked,
          }
        : null,
    },
    unreadMessages: naoLidas,
    generatedAt: new Date().toISOString(),
  };
}

function resumirMissoesGuilda(missoes) {
  if (!missoes || missoes.length === 0) return null;
  return {
    total: missoes.length,
    concluidas: missoes.filter((m) => m.concluida).length,
  };
}

function resumirBossGuilda(boss) {
  if (!boss) return null;
  return {
    liberadoEstaSemana: boss.liberado_esta_semana,
    rankAtual: boss.rank_atual,
  };
}

function montarProfissoes({ forgeProgress, alchemyProgress, profissoesExpedicao, progressoPesca }) {
  const lista = [];
  if (forgeProgress) lista.push({ key: "FERREIRO", nivel: forgeProgress.nivel });
  if (alchemyProgress) {
    lista.push({
      key: "ALQUIMIA",
      // Mesmo critério de playerShopService.js: nível de Alquimia é
      // SEMPRE derivado do XP total, nunca lido direto da coluna
      // `nivel` (que pode estar desatualizada — ver fix anterior).
      nivel: alchemyProgressionService.nivelPorXpTotal(alchemyProgress.experiencia),
    });
  }
  for (const profissao of profissoesExpedicao ?? []) {
    lista.push({ key: profissao.tipo?.toUpperCase() ?? "EXPEDICAO", nivel: profissao.nivel });
  }
  if (progressoPesca) lista.push({ key: "PESCA", nivel: progressoPesca.nivel });
  return lista;
}

function montarResumoLoja({ loja, demandas, encomendas, idPersonagem }) {
  if (!loja) return { exists: false };

  const demandasAbertas = (demandas ?? []).filter((d) => d.status === "Aberta");
  const encomendasRecebidas = encomendas?.recebidas ?? [];
  const encomendasEnviadas = encomendas?.enviadas ?? [];
  const encomendasEmAndamento = [...encomendasRecebidas, ...encomendasEnviadas].filter((e) =>
    ["AguardandoLojista", "AguardandoCliente", "Aceita", "ProntaEntrega"].includes(e.status),
  );

  // Pendência = o estado exige uma resposta MINHA, não da outra parte.
  const pendingActions =
    encomendasRecebidas.filter((e) => ["AguardandoLojista", "ProntaEntrega"].includes(e.status)).length +
    encomendasEnviadas.filter((e) => e.status === "AguardandoCliente").length;

  return {
    exists: true,
    activeProducts: loja.produtosAtivos,
    openDemands: demandasAbertas.length,
    commissionsByStatus: {
      emAndamento: encomendasEmAndamento.length,
      recebidas: encomendasRecebidas.length,
      enviadas: encomendasEnviadas.length,
    },
    pendingActions,
  };
}

function montarAtividades({ cacada, contratos, forja, demandas, encomendas, torneioPesca }) {
  const atividades = [];

  if (cacada?.ativa) {
    atividades.push({
      key: "hunt",
      category: "hunt",
      title: cacada.ativa.title_snapshot ?? "Caçada ativa",
      progressCurrent: cacada.ativa.progress,
      progressMax: cacada.ativa.quantity_required,
      href: "/dashboard/quests",
    });
  }

  for (const contrato of contratos ?? []) {
    if (contrato.status !== "Ativo") continue;
    atividades.push({
      key: `contract-${contrato.id}`,
      category: "contract",
      title: contrato.missao?.nome ?? "Contrato da Guilda dos Aventureiros",
      progressCurrent: contrato.progresso_atual ?? null,
      progressMax: contrato.missao?.quantidade_objetivo ?? null,
      href: "/dashboard/quests",
    });
  }

  if (forja?.Forja) {
    atividades.push({
      key: "forge",
      category: "forge",
      title: forja.Forja.pronto ? "Item pronto na Forja" : "Em produção na Forja",
      progressCurrent: forja.Forja.pronto ? 1 : 0,
      progressMax: 1,
      href: "/dashboard/forge",
    });
  }

  for (const demanda of (demandas ?? []).filter((d) => d.status === "Aberta")) {
    atividades.push({
      key: `demand-${demanda.id}`,
      category: "shop",
      title: `Demanda: ${demanda.item?.nome ?? "item"}`,
      progressCurrent: demanda.quantidade_entregue,
      progressMax: demanda.quantidade_desejada,
      href: "/dashboard/market",
    });
  }

  const encomendasAtivas = [...(encomendas?.recebidas ?? []), ...(encomendas?.enviadas ?? [])].filter((e) =>
    ["AguardandoLojista", "AguardandoCliente", "Aceita", "ProntaEntrega"].includes(e.status),
  );
  for (const encomenda of encomendasAtivas) {
    atividades.push({
      key: `commission-${encomenda.id}`,
      category: "shop",
      title: `Encomenda: ${encomenda.item?.nome ?? "item"}`,
      status: encomenda.status,
      href: "/dashboard/market",
    });
  }

  if (torneioPesca?.torneio) {
    atividades.push({
      key: "fishing-tournament",
      category: "fishing_tournament",
      title: torneioPesca.torneio.nome ?? "Torneio de Pesca",
      progressCurrent: torneioPesca.minhaPosicao?.pontuacao ?? null,
      href: "/dashboard/fishing",
    });
  }

  return atividades;
}

function montarAttentionItems({
  cacada,
  contratos,
  forja,
  demandas,
  encomendas,
  missoesGuilda,
  bossGuilda,
  torneioPesca,
  worldBoss,
}) {
  const candidatos = [];

  // Alta prioridade (§6): Forja pronta; contraproposta/pedido aguardando;
  // recompensa disponível; World Boss ativo.
  if (forja?.Forja?.pronto) {
    candidatos.push({
      key: "forge-ready",
      priority: "HIGH",
      category: "forge",
      title: "Item pronto na Forja",
      description: "Colete o que terminou de ser forjado.",
      href: "/dashboard/forge",
    });
  }

  const encomendasRecebidas = encomendas?.recebidas ?? [];
  const encomendasEnviadas = encomendas?.enviadas ?? [];
  const pendenciasLojista = encomendasRecebidas.filter((e) => ["AguardandoLojista", "ProntaEntrega"].includes(e.status));
  const pendenciasCliente = encomendasEnviadas.filter((e) => e.status === "AguardandoCliente");
  if (pendenciasLojista.length + pendenciasCliente.length > 0) {
    candidatos.push({
      key: "shop-pending",
      priority: "HIGH",
      category: "shop",
      title: "Encomenda aguardando sua resposta",
      description: `${pendenciasLojista.length + pendenciasCliente.length} encomenda(s) precisam de você.`,
      href: "/dashboard/market",
    });
  }

  for (const contrato of contratos ?? []) {
    if (contrato.status === "Concluido") {
      candidatos.push({
        key: `contract-reward-${contrato.id}`,
        priority: "HIGH",
        category: "contract",
        title: "Contrato pronto pra resgatar",
        description: contrato.missao?.nome ?? "Recompensa disponível na Guilda dos Aventureiros.",
        href: "/dashboard/quests",
      });
    }
  }

  if (worldBoss && ["DISCOVERED", "ACTIVE"].includes(worldBoss.status)) {
    candidatos.push({
      key: "world-boss-active",
      priority: "HIGH",
      category: "world_boss",
      title: "Ameaça Mundial ativa",
      description: worldBoss.nome ?? "Uma Ameaça Mundial está em andamento.",
      href: "/dashboard/quests",
    });
  }

  // Média prioridade: caçada ativa; contrato em andamento; torneio em
  // andamento; missão de Guilda relevante.
  if (cacada?.ativa) {
    candidatos.push({
      key: "hunt-active",
      priority: "MEDIUM",
      category: "hunt",
      title: "Caçada em andamento",
      description: cacada.ativa.title_snapshot ?? "Continue sua caçada ativa.",
      progressCurrent: cacada.ativa.progress,
      progressMax: cacada.ativa.quantity_required,
      href: "/dashboard/quests",
    });
  }

  if ((contratos ?? []).some((c) => c.status === "Ativo")) {
    candidatos.push({
      key: "contract-active",
      priority: "MEDIUM",
      category: "contract",
      title: "Contrato em andamento",
      description: "Você tem um contrato aceito na Guilda dos Aventureiros.",
      href: "/dashboard/quests",
    });
  }

  if (bossGuilda && bossGuilda.liberado_esta_semana === false) {
    candidatos.push({
      key: "guild-boss-available",
      priority: "MEDIUM",
      category: "guild_boss",
      title: "Boss da Guilda disponível",
      description: "Ainda não foi liberado nesta semana.",
      href: "/dashboard/guilds",
    });
  }

  if ((missoesGuilda ?? []).some((m) => !m.concluida)) {
    candidatos.push({
      key: "guild-mission-pending",
      priority: "MEDIUM",
      category: "guild_mission",
      title: "Missão da Guilda em aberto",
      description: "Ajude sua guilda a avançar.",
      href: "/dashboard/guilds",
    });
  }

  if (torneioPesca?.torneio && torneioPesca.status === "EM_ANDAMENTO") {
    candidatos.push({
      key: "fishing-tournament-active",
      priority: "MEDIUM",
      category: "fishing_tournament",
      title: "Torneio de Pesca em andamento",
      description: torneioPesca.torneio.nome ?? "Participe do torneio ativo.",
      href: "/dashboard/fishing",
    });
  }

  return ordenarComLimite(candidatos);
}

module.exports = { buildForCharacter };
