// Progresso de Pesca — espelha forgeProgressionService.js, mas usando a
// curva 1..25 de fishingConfig.js (spec §7).
const CharacterFishingProgress = require("../models/CharacterFishingProgress");
const { nivelPescaPorXpTotal, xpParaProximoNivelPesca, NIVEL_MAXIMO_PESCA } = require("../config/fishingConfig");

async function garantirProgresso(characterId, transaction) {
  const [progresso] = await CharacterFishingProgress.findOrCreate({
    where: { id_personagem: characterId },
    defaults: { id_personagem: characterId },
    transaction,
  });
  return progresso;
}

async function obterProgresso(characterId) {
  const progresso = await garantirProgresso(characterId);
  const nivel = nivelPescaPorXpTotal(progresso.experiencia);
  return {
    nivel,
    experiencia: progresso.experiencia,
    xp_proximo_nivel: xpParaProximoNivelPesca(nivel),
    nivel_maximo: NIVEL_MAXIMO_PESCA,
    total_capturado: progresso.total_capturado,
  };
}

// Aplica ganho de XP dentro de uma transaction já aberta (chamado pela
// finalização de captura — spec §30) — trava a linha primeiro.
async function aplicarGanhoDeXp(characterId, xpGanho, transaction) {
  const progresso = await CharacterFishingProgress.findOne({
    where: { id_personagem: characterId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const linha =
    progresso ??
    (await CharacterFishingProgress.create({ id_personagem: characterId }, { transaction }));
  linha.experiencia += xpGanho;
  linha.total_capturado += 1;
  linha.nivel = nivelPescaPorXpTotal(linha.experiencia);
  await linha.save({ transaction });
  return linha;
}

module.exports = { garantirProgresso, obterProgresso, aplicarGanhoDeXp };
