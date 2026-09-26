// Perfil de Jogador — camada agregadora sobre sistemas já existentes
// (Especificação Perfil de Jogador, §1/§21/§36). Controller fino: toda
// regra de composição/privacidade fica aqui.
const Character = require("../models/Character");
const Race = require("../models/Race");
const Class = require("../models/Class");
const GuildMember = require("../models/GuildMember");
const Guild = require("../models/Guild");
const CharacterEquipment = require("../models/CharacterEquipment");
const Item = require("../models/Item");
const WeaponProperties = require("../models/WeaponProperties");
const ArmorProperties = require("../models/ArmorProperties");
const ItemRarityAttributeOverride = require("../models/ItemRarityAttributeOverride");
const CharacterEquipmentInstance = require("../models/CharacterEquipmentInstance");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const CharacterProfession = require("../models/CharacterProfession");
const CharacterAdventureGuildProgress = require("../models/CharacterAdventureGuildProgress");
const CharacterAdventureGuildContract = require("../models/CharacterAdventureGuildContract");
const CharacterHunterProgress = require("../models/CharacterHunterProgress");
const CharacterProfile = require("../models/CharacterProfile");
const Title = require("../models/Title");
const Achievement = require("../models/Achievement");
const CharacterProfileAchievementHighlight = require("../models/CharacterProfileAchievementHighlight");
const CharacterProfileMonsterHighlight = require("../models/CharacterProfileMonsterHighlight");
const AdventureMonster = require("../models/AdventureMonster");
const CharacterMonsterKill = require("../models/CharacterMonsterKill");

const { formatarEquipado } = require("./equipmentInstanceService");
const { nivelPorXpTotal: nivelExpedicaoPorXp } = require("./expeditionProgressionService");
const bestiaryService = require("./bestiaryService");
const achievementService = require("./achievementService");
const combatPowerService = require("./combatPowerService");
const rankedSeasonService = require("./rankedSeasonService");
const rankedRatingService = require("./rankedRatingService");
const rankedTierService = require("./rankedTierService");
const { formatarResumoReputacao } = require("./spoilReputationService");
const { formatarResumoReputacao: formatarResumoReputacaoCacador } = require("./hunterReputationService");
const uniqueFeatPublicService = require("./uniqueFeatPublicService");

class ProfileError extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

async function carregarCharacterBase(idPersonagem) {
  return Character.findByPk(idPersonagem, {
    include: [
      { model: Race },
      { model: Class },
    ],
  });
}

// §7/§8 — bloco Hero. `incluirAtributos` só é true no próprio perfil
// (§39 — atributos detalhados nunca aparecem pro visitante).
function montarIdentidade(character, { incluirAtributos }) {
  const nomeRaca = character.Race
    ? character.genero === "Feminino"
      ? character.Race.nome_feminino
      : character.Race.nome_masculino
    : null;

  const base = {
    id: character.id,
    nome: character.nome,
    avatar_key: character.avatar_key,
    genero: character.genero,
    nivel: character.nivel,
    raca: nomeRaca,
    classe: character.Class?.nome ?? null,
    natureza_magica: character.natureza_magica,
    id_evolucao_classe: character.id_evolucao_classe ?? null,
  };

  if (incluirAtributos) {
    base.atributos = {
      forca: character.forca,
      vitalidade: character.vitalidade,
      agilidade: character.agilidade,
      inteligencia: character.inteligencia,
      velocidade: character.velocidade,
    };
  }

  return base;
}

// §16 — nunca expõe tesouro/permissões/mural/dados de gestão.
async function montarGuilda(idPersonagem) {
  const membro = await GuildMember.findOne({
    where: { id_personagem: idPersonagem },
    include: [{ model: Guild, attributes: ["id", "nome", "sigla", "rank"] }],
  });
  if (!membro || !membro.Guild) return null;
  return {
    id: membro.Guild.id,
    nome: membro.Guild.nome,
    sigla: membro.Guild.sigla,
    rank_guilda: membro.Guild.rank,
    cargo: membro.cargo,
  };
}

// §12/§13 — só os itens EQUIPADOS, nunca o inventário. Reaproveita o
// mesmo formatarEquipado do inventário v2 (Tier/Raridade/Refino já
// calculados ali, sem reimplementar).
async function montarEquipamentosPublicos(idPersonagem) {
  const equipados = await CharacterEquipment.findAll({
    where: { id_personagem: idPersonagem },
    include: [
      {
        model: Item,
        as: "item",
        include: [
          { model: WeaponProperties, as: "weaponProperties" },
          { model: ArmorProperties, as: "armorProperties" },
          { model: ItemRarityAttributeOverride, as: "raridadeOverrides" },
        ],
      },
      { model: CharacterEquipmentInstance, as: "instancia" },
    ],
  });
  return equipados.map(formatarEquipado);
}

// §14/§15 — Forja + 3 profissões de Expedição + Rank de Aventureiro
// (com contagem de contratos concluídos, lifetime — não confundir com
// CharacterAdventureGuildProgress.missoes_concluidas_no_rank, que zera
// a cada promoção).
async function montarProgressao(idPersonagem, character) {
  const [forja, profissoes, progressoAventureiro, contratosConcluidos, progressoCacador] = await Promise.all([
    CharacterForgeProgress.findOne({ where: { id_personagem: idPersonagem } }),
    CharacterProfession.findAll({ where: { id_personagem: idPersonagem } }),
    CharacterAdventureGuildProgress.findOne({ where: { id_personagem: idPersonagem } }),
    CharacterAdventureGuildContract.count({
      where: { id_personagem: idPersonagem, status: ["Concluido", "Resgatado"] },
    }),
    CharacterHunterProgress.findOne({ where: { id_personagem: idPersonagem } }),
  ]);

  const profissaoPorTipo = {};
  for (const p of profissoes) {
    profissaoPorTipo[p.tipo] = nivelExpedicaoPorXp(p.experiencia);
  }

  const reputacaoComercial = formatarResumoReputacao(progressoAventureiro?.reputacao_encomendas ?? 0);
  const reputacaoCacador = formatarResumoReputacaoCacador(progressoCacador?.reputation_points ?? 0);

  return {
    nivel: character.nivel,
    rank_aventureiro: {
      rank: progressoAventureiro?.rank ?? character.rank ?? "F",
      contratos_concluidos: contratosConcluidos,
    },
    // Balcão de Espólios §12 / Caçadas §18 — mesmas duas progressões que
    // já aparecem em /characters/me (adventureGuildProfile), agora
    // também na vitrine pública: nenhuma delas expõe algo mais sensível
    // que o próprio Rank de Aventureiro acima.
    reputacao_comercial: {
      pontos: reputacaoComercial.points,
      nivel: reputacaoComercial.level,
      titulo: reputacaoComercial.name,
      encomendas_concluidas: progressoAventureiro?.total_spoil_orders_completed ?? 0,
    },
    reputacao_cacador: {
      pontos: reputacaoCacador.points,
      nivel: reputacaoCacador.level,
      titulo: reputacaoCacador.title,
      cacadas_concluidas: progressoCacador?.hunts_completed_total ?? 0,
    },
    forja: { nivel: forja?.nivel ?? 1 },
    expedicao: {
      mineracao: profissaoPorTipo.Mineracao ?? 1,
      silvicultura: profissaoPorTipo.Silvicultura ?? 1,
      exploracao: profissaoPorTipo.Exploracao ?? 1,
    },
  };
}

// §17 — só Arena Ranqueada (temporada atual + medalhas de temporadas
// encerradas). PvP casual e Torneio ficam fora do perfil de propósito.
async function montarPvp(idPersonagem) {
  const temporada = await rankedSeasonService.obterOuIniciarTemporadaAtiva();
  const [participacao, medalhas] = await Promise.all([
    temporada ? rankedRatingService.obterOuCriarParticipacao(idPersonagem, temporada.id) : null,
    rankedSeasonService.medalhasDoPersonagem(idPersonagem),
  ]);

  const resumoTier = participacao ? rankedTierService.resumoTier(participacao.rating) : null;
  const resumoPico = participacao?.peak_rating ? rankedTierService.resumoTier(participacao.peak_rating) : null;
  const vitoriasTemporada = participacao?.vitorias ?? 0;
  const derrotasTemporada = participacao?.derrotas ?? 0;
  const totalJogosTemporada = vitoriasTemporada + derrotasTemporada;

  return {
    ranked: resumoTier
      ? {
          tier: resumoTier.tier,
          divisao: resumoTier.divisao,
          tier_label: resumoTier.tierLabel,
          rating: participacao.rating,
          pico_rating: participacao.peak_rating ?? participacao.rating,
          pico_tier_label: resumoPico?.tierLabel ?? resumoTier.tierLabel,
        }
      : null,
    temporada: temporada ? { id: temporada.id, nome: temporada.nome ?? null } : null,
    vitorias_temporada: vitoriasTemporada,
    derrotas_temporada: derrotasTemporada,
    taxa_vitoria_temporada:
      totalJogosTemporada > 0 ? Math.round((vitoriasTemporada / totalJogosTemporada) * 1000) / 10 : null,
    medalhas: { ouro: medalhas.ouro, prata: medalhas.prata, bronze: medalhas.bronze },
  };
}

// §18/§19 — resumo, nunca a ficha completa de cada monstro.
async function montarBestiarioResumo(idPersonagem) {
  const { resumo } = await bestiaryService.listarRegioes(idPersonagem);
  return resumo;
}

async function montarDestaques(idPersonagem) {
  const [conquistas, monstros] = await Promise.all([
    CharacterProfileAchievementHighlight.findAll({
      where: { id_personagem: idPersonagem },
      include: [{ model: Achievement, as: "achievement" }],
      order: [["slot", "ASC"]],
    }),
    CharacterProfileMonsterHighlight.findAll({
      where: { id_personagem: idPersonagem },
      include: [{ model: AdventureMonster, as: "monstro" }],
      order: [["slot", "ASC"]],
    }),
  ]);

  const monstrosComAbates = await Promise.all(
    monstros.map(async (destaque) => {
      const kill = await CharacterMonsterKill.findOne({
        where: { id_personagem: idPersonagem, nome_monstro: destaque.monstro.nome },
      });
      return {
        slot: destaque.slot,
        id_monstro: destaque.id_monstro,
        nome: destaque.monstro.nome,
        abates: kill?.quantidade ?? 0,
      };
    }),
  );

  return {
    conquistas: conquistas.map((c) => ({
      slot: c.slot,
      id_achievement: c.id_achievement,
      key: c.achievement.key,
      nome: c.achievement.nome,
      icone_url: c.achievement.icone_url,
    })),
    monstros: monstrosComAbates,
  };
}

async function montarConquistasResumo(idPersonagem) {
  const desbloqueadas = await achievementService.listarConquistasDoPersonagem(idPersonagem);
  return {
    total: desbloqueadas.length,
    lista: desbloqueadas.map((c) => ({
      id_achievement: c.id_achievement,
      key: c.achievement.key,
      nome: c.achievement.nome,
      descricao: c.achievement.descricao,
      icone_url: c.achievement.icone_url,
      categoria: c.achievement.categoria,
      desbloqueada_em: c.desbloqueada_em,
    })),
  };
}

async function montarPoder(idPersonagem) {
  // §9/§52 — opcional de propósito: o Perfil não pode quebrar se o
  // cálculo falhar por qualquer motivo (personagem sem classe/raça
  // ainda, etc.) — o sistema de Poder já está implementado (ver
  // combatPowerService.js), mas o contrato aqui continua sendo
  // "nullable e nunca derruba a página".
  try {
    const poder = await combatPowerService.calcularPoderPersonagem(idPersonagem);
    return poder ? { total: poder.combatPower, version: poder.version } : null;
  } catch (error) {
    console.error("Erro ao calcular Poder de Combate pro Perfil:", error);
    return null;
  }
}

// §6/§35 — perfil PÚBLICO: nunca email/id_usuario/gold/inventário/
// atributos detalhados (§38/§39). `viewerUserId` (req.user.id, NUNCA um
// character id vindo do cliente) decide só `permissions.eh_proprio`.
async function obterPerfilPublico(idPersonagem, viewerUserId) {
  const character = await carregarCharacterBase(idPersonagem);
  if (!character) throw new ProfileError("Aventureiro não encontrado.", 404);

  const perfilCustom = await CharacterProfile.findOne({
    where: { id_personagem: idPersonagem },
    include: [{ model: Title, as: "tituloSelecionado" }],
  });

  const ehProprio = Boolean(viewerUserId) && Number(viewerUserId) === Number(character.id_usuario);
  const ocultarEquipamentos = Boolean(perfilCustom?.ocultar_equipamentos);
  // Visitante com equipamento oculto nem dispara a consulta — a lista
  // nunca sai do servidor.
  const equipamentoOcultoParaViewer = ocultarEquipamentos && !ehProprio;

  const [guild, equipment, progression, pvp, bestiary, destaques, conquistas, combatPower, uniqueFeats] = await Promise.all([
    montarGuilda(idPersonagem),
    equipamentoOcultoParaViewer ? [] : montarEquipamentosPublicos(idPersonagem),
    montarProgressao(idPersonagem, character),
    montarPvp(idPersonagem),
    montarBestiarioResumo(idPersonagem),
    montarDestaques(idPersonagem),
    montarConquistasResumo(idPersonagem),
    montarPoder(idPersonagem),
    // Sistema de Proezas Únicas §14 — card distinto das Achievements
    // comuns, sempre completo (é o próprio dono do feito).
    uniqueFeatPublicService.obterProezasDoPersonagem(idPersonagem),
  ]);

  return {
    identity: {
      ...montarIdentidade(character, { incluirAtributos: false }),
      frase: perfilCustom?.frase ?? null,
      titulo: perfilCustom?.tituloSelecionado ? perfilCustom.tituloSelecionado.nome : null,
    },
    combatPower,
    guild,
    equipment,
    equipment_oculto: equipamentoOcultoParaViewer,
    progression,
    pvp,
    bestiary,
    achievements: conquistas,
    uniqueFeats,
    highlights: destaques,
    permissions: {
      eh_proprio: ehProprio,
      pode_enviar_mensagem: !ehProprio,
      pode_convidar_party: !ehProprio,
      pode_convidar_guilda: !ehProprio,
    },
  };
}

// §6 — perfil PRÓPRIO: mesmos blocos + atributos detalhados + gold/
// inventário continuam de fora ("não nesta página", §6) — só o que a
// spec lista como exclusivo do dono (atributos, breakdown de Poder,
// edição) muda aqui.
async function obterPerfilProprio(idPersonagem) {
  const character = await carregarCharacterBase(idPersonagem);
  if (!character) throw new ProfileError("Aventureiro não encontrado.", 404);
  // Chamador já SABE que é o dono (rota /me/profile ou GET/:id/profile
  // com id_usuario batendo) — passa o próprio id_usuario como viewer pra
  // reaproveitar toda a montagem de obterPerfilPublico sem duplicar
  // lógica, e o resultado já sai com eh_proprio: true.
  const perfil = await obterPerfilPublico(idPersonagem, character.id_usuario);
  perfil.identity = {
    ...perfil.identity,
    ...montarIdentidade(character, { incluirAtributos: true }),
    frase: perfil.identity.frase,
    titulo: perfil.identity.titulo,
  };
  // Só o dono precisa saber QUAIS títulos pode escolher (§25/§43 —
  // TitleSelector é "somente próprio perfil").
  const [titulosDesbloqueados, perfilCustom] = await Promise.all([
    achievementService.listarTitulosDoPersonagem(idPersonagem),
    CharacterProfile.findByPk(idPersonagem, { attributes: ["ocultar_equipamentos"] }),
  ]);
  perfil.titulos_disponiveis = titulosDesbloqueados.map((t) => ({ id: t.id_title, nome: t.title.nome }));
  perfil.privacidade = { ocultar_equipamentos: Boolean(perfilCustom?.ocultar_equipamentos) };
  return perfil;
}

const LIMITE_FRASE = 140;

function sanitizarFrase(frase) {
  if (frase === null || frase === undefined) return null;
  const semHtml = String(frase).replace(/<[^>]*>/g, "").trim();
  if (semHtml.length === 0) return null;
  if (semHtml.length > LIMITE_FRASE) {
    throw new ProfileError(`A frase de perfil não pode passar de ${LIMITE_FRASE} caracteres.`, 400);
  }
  return semHtml;
}

// §40/§56 — PATCH usa SEMPRE o characterId do JWT/currentCharacter
// (nunca um id vindo do corpo); valida ownership de título/conquista/
// monstro server-side.
async function atualizarPersonalizacao(idPersonagem, payload) {
  const [perfil] = await CharacterProfile.findOrCreate({
    where: { id_personagem: idPersonagem },
    defaults: { id_personagem: idPersonagem },
  });

  if (Object.prototype.hasOwnProperty.call(payload, "frase")) {
    perfil.frase = sanitizarFrase(payload.frase);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "id_titulo_selecionado")) {
    if (payload.id_titulo_selecionado === null) {
      perfil.id_titulo_selecionado = null;
    } else {
      const possui = await require("../models/CharacterTitle").findOne({
        where: { id_personagem: idPersonagem, id_title: payload.id_titulo_selecionado },
      });
      if (!possui) throw new ProfileError("Você não desbloqueou esse título.", 403);
      perfil.id_titulo_selecionado = payload.id_titulo_selecionado;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "ocultar_equipamentos")) {
    if (typeof payload.ocultar_equipamentos !== "boolean") {
      throw new ProfileError("ocultar_equipamentos precisa ser true ou false.", 400);
    }
    perfil.ocultar_equipamentos = payload.ocultar_equipamentos;
  }

  await perfil.save();

  if (Array.isArray(payload.conquistas_destaque)) {
    await atualizarDestaquesDeConquista(idPersonagem, payload.conquistas_destaque);
  }
  if (Array.isArray(payload.monstros_destaque)) {
    await atualizarDestaquesDeMonstro(idPersonagem, payload.monstros_destaque);
  }

  return obterPerfilProprio(idPersonagem);
}

async function atualizarDestaquesDeConquista(idPersonagem, idsAchievement) {
  if (idsAchievement.length > 3) {
    throw new ProfileError("No máximo 3 conquistas em destaque.", 400);
  }
  const idsValidos = idsAchievement.filter((id) => id !== null && id !== undefined);
  if (idsValidos.length > 0) {
    const desbloqueadas = await require("../models/CharacterAchievement").findAll({
      where: { id_personagem: idPersonagem, id_achievement: idsValidos },
    });
    if (desbloqueadas.length !== idsValidos.length) {
      throw new ProfileError("Só é possível destacar conquistas já desbloqueadas.", 403);
    }
  }

  await CharacterProfileAchievementHighlight.destroy({ where: { id_personagem: idPersonagem } });
  for (let i = 0; i < idsAchievement.length; i += 1) {
    if (idsAchievement[i] === null || idsAchievement[i] === undefined) continue;
    await CharacterProfileAchievementHighlight.create({
      id_personagem: idPersonagem,
      slot: i + 1,
      id_achievement: idsAchievement[i],
    });
  }
}

async function atualizarDestaquesDeMonstro(idPersonagem, idsMonstro) {
  if (idsMonstro.length > 3) {
    throw new ProfileError("No máximo 3 criaturas em destaque.", 400);
  }
  const idsValidos = idsMonstro.filter((id) => id !== null && id !== undefined);
  if (idsValidos.length > 0) {
    const monstros = await AdventureMonster.findAll({ where: { id: idsValidos } });
    if (monstros.length !== idsValidos.length) {
      throw new ProfileError("Criatura inválida.", 400);
    }
    for (const monstro of monstros) {
      const kill = await CharacterMonsterKill.findOne({
        where: { id_personagem: idPersonagem, nome_monstro: monstro.nome },
      });
      if (!kill?.primeira_derrota_em) {
        throw new ProfileError(`Você ainda não descobriu "${monstro.nome}".`, 403);
      }
    }
  }

  await CharacterProfileMonsterHighlight.destroy({ where: { id_personagem: idPersonagem } });
  for (let i = 0; i < idsMonstro.length; i += 1) {
    if (idsMonstro[i] === null || idsMonstro[i] === undefined) continue;
    await CharacterProfileMonsterHighlight.create({
      id_personagem: idPersonagem,
      slot: i + 1,
      id_monstro: idsMonstro[i],
    });
  }
}

module.exports = {
  ProfileError,
  obterPerfilPublico,
  obterPerfilProprio,
  atualizarPersonalizacao,
  montarEquipamentosPublicos,
  montarProgressao,
  montarPvp,
  montarBestiarioResumo,
};
