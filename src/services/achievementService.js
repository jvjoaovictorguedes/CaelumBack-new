// Conquistas (Especificação Perfil de Jogador, §21-§23/§51) — concessão
// idempotente (a unique de character_achievements garante isso mesmo
// sob concorrência) chamada a partir de eventos/serviços reais, nunca
// varrendo todo o histórico a cada abertura de perfil.
const Character = require("../models/Character");
const Achievement = require("../models/Achievement");
const CharacterAchievement = require("../models/CharacterAchievement");
const Title = require("../models/Title");
const CharacterTitle = require("../models/CharacterTitle");
const CharacterMonsterKill = require("../models/CharacterMonsterKill");
const CharacterForgeProgress = require("../models/CharacterForgeProgress");
const TournamentParticipant = require("../models/TournamentParticipant");
const PvpStatus = require("../models/PvpStatus");
const CharacterPvpSeason = require("../models/CharacterPvpSeason");

const REQUISITO_SENHOR_DO_LABIRINTO = 100;
const REQUISITO_VETERANO_DA_ARENA = 100;
const REQUISITO_FORJA_NIVEL = 10;

// Concede a conquista `key` ao personagem se ainda não tiver — idempotente
// por construção (unique id_personagem+id_achievement, ver migration).
// Se a conquista desbloquear um Título (§26), concede o título junto,
// também idempotente.
async function grantByKey(characterId, achievementKey, transaction) {
  const achievement = await Achievement.findOne({ where: { key: achievementKey, ativa: true }, transaction });
  if (!achievement) return null;

  const [linha, criada] = await CharacterAchievement.findOrCreate({
    where: { id_personagem: characterId, id_achievement: achievement.id },
    defaults: { desbloqueada_em: new Date() },
    transaction,
  });

  const titulo = await Title.findOne({ where: { id_achievement_desbloqueia: achievement.id, ativa: true }, transaction });
  if (titulo) {
    await CharacterTitle.findOrCreate({
      where: { id_personagem: characterId, id_title: titulo.id },
      defaults: { desbloqueado_em: new Date() },
      transaction,
    });
  }

  return { achievement, jaTinha: !criada, linha };
}

// §23 — chamado depois de registrarMorte (combatController.js), que já
// roda dentro da mesma transação da vitória.
async function checkMonsterKillAchievements(characterId, transaction) {
  const totalDerrotas = await CharacterMonsterKill.sum("quantidade", {
    where: { id_personagem: characterId },
    transaction,
  });
  if ((totalDerrotas ?? 0) >= 1) {
    await grantByKey(characterId, "primeiro_sangue", transaction);
  }

  const minotauro = await CharacterMonsterKill.findOne({
    where: { id_personagem: characterId, nome_monstro: "Minotauro" },
    transaction,
  });
  if ((minotauro?.quantidade ?? 0) >= REQUISITO_SENHOR_DO_LABIRINTO) {
    await grantByKey(characterId, "senhor_do_labirinto", transaction);
  }
}

// §23 — chamado a partir do Bestiário depois de qualquer abate (o mesmo
// evento que muda descoberta/maestria). Reaproveita bestiaryService em
// vez de reimplementar a contagem — custo aceitável (só roda em vitória
// de combate, não em toda leitura de perfil).
async function checkBestiaryAchievements(characterId, transaction) {
  // Require tardio pra evitar ciclo: bestiaryService não depende deste
  // arquivo, mas mantém o import perto de onde é usado por clareza.
  const bestiaryService = require("./bestiaryService");
  const { resumo } = await bestiaryService.listarRegioes(characterId);

  if (resumo.regioes_completas >= 1) {
    await grantByKey(characterId, "naturalista", transaction);
  }
  if (resumo.maestrias_v >= 1) {
    await grantByKey(characterId, "mestre_do_bestiario", transaction);
  }
}

// §23 — chamado depois de progresso.save() em forgeService.js quando o
// nível sobe.
async function checkForgeAchievements(characterId, transaction) {
  const progresso = await CharacterForgeProgress.findOne({ where: { id_personagem: characterId }, transaction });
  if ((progresso?.nivel ?? 0) >= REQUISITO_FORJA_NIVEL) {
    await grantByKey(characterId, "mestre_ferreiro", transaction);
  }
}

// §23 — "Veterano da Arena" (100 vitórias, somando ranqueado + casual —
// a spec não distingue) e "Campeão" (venceu qualquer torneio). Hoje só
// é chamada a partir da conquista de um torneio (ver
// tournamentMatchService.aplicarFimDeSerie) — pronta pra também ser
// chamada a partir de um incremento de vitória ranqueada/casual quando
// esse hook for adicionado (ver relatório final: pendência registrada).
async function checkPvpAchievements(characterId, transaction) {
  const [casual, temporadas] = await Promise.all([
    PvpStatus.findOne({ where: { id_personagem: characterId }, transaction }),
    CharacterPvpSeason.findAll({ where: { character_id: characterId }, transaction }),
  ]);
  const vitoriasRankeadas = temporadas.reduce((soma, t) => soma + (t.vitorias ?? 0), 0);
  const totalVitorias = (casual?.vitorias ?? 0) + vitoriasRankeadas;
  if (totalVitorias >= REQUISITO_VETERANO_DA_ARENA) {
    await grantByKey(characterId, "veterano_da_arena", transaction);
  }

  const foiCampeao = await TournamentParticipant.findOne({
    where: { character_id: characterId, final_placement: 1 },
    transaction,
  });
  if (foiCampeao) {
    await grantByKey(characterId, "campeao", transaction);
  }
}

async function listarConquistasDoPersonagem(characterId) {
  return CharacterAchievement.findAll({
    where: { id_personagem: characterId },
    include: [{ model: Achievement, as: "achievement" }],
    order: [["desbloqueada_em", "DESC"]],
  });
}

async function listarTitulosDoPersonagem(characterId) {
  return CharacterTitle.findAll({
    where: { id_personagem: characterId },
    include: [{ model: Title, as: "title" }],
    order: [["desbloqueado_em", "DESC"]],
  });
}

module.exports = {
  grantByKey,
  checkMonsterKillAchievements,
  checkBestiaryAchievements,
  checkForgeAchievements,
  checkPvpAchievements,
  listarConquistasDoPersonagem,
  listarTitulosDoPersonagem,
};
