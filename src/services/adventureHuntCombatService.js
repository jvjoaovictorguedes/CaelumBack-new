// Caçadas §6/§6.1/§16 — composição do modificador de vida/dano no
// snapshot do encontro (nunca no AdventureMonster global) e a contagem
// de morte + conclusão transacional, chamadas de dentro do MESMO fluxo
// que combatController.js já usa pra gerar o inimigo e processar a
// vitória — nunca um caminho paralelo.
const CharacterAdventureHunt = require("../models/CharacterAdventureHunt");
const CharacterHunterProgress = require("../models/CharacterHunterProgress");
const { concederOuro } = require("./goldService");
const { HUNT_DIFFICULTIES } = require("../config/huntConfig");

const CONTADOR_POR_DIFICULDADE = {
  Dangerous: "hunts_completed_dangerous",
  Difficult: "hunts_completed_difficult",
  Deadly: "hunts_completed_deadly",
  Nightmare: "hunts_completed_nightmare",
  Extermination: "hunts_completed_extermination",
};

// §6 — resolvido no MOMENTO de gerar o inimigo (gerarInimigoParaPersonagem):
// se o personagem tem uma Caçada Ativa cujo alvo é exatamente o
// monstro sorteado, devolve os multiplicadores pra compor em cima do
// perfil normal; senão null (sem modificador nenhum). Nunca consulta
// nem muda o AdventureMonster.
async function resolverModificadorParaEncontro(idPersonagem, idMonstro, transaction) {
  const cacada = await CharacterAdventureHunt.findOne({
    where: { id_personagem: idPersonagem, status: "Active", id_monstro: idMonstro },
    transaction,
  });
  if (!cacada) return null;

  return {
    huntId: cacada.id,
    difficulty: cacada.difficulty,
    difficultyLabel: HUNT_DIFFICULTIES[cacada.difficulty]?.nome ?? cacada.difficulty,
    hpMultiplier: cacada.hp_multiplier_snapshot,
    damageMultiplier: cacada.damage_multiplier_snapshot,
  };
}

async function obterOuCriarProgresso(idPersonagem, transaction) {
  const [progresso] = await CharacterHunterProgress.findOrCreate({
    where: { id_personagem: idPersonagem },
    defaults: {},
    transaction,
  });
  return progresso;
}

// §6.1/§16 — chamado de dentro de concederVitoriaEResponder, na MESMA
// transação que já trava o Character pra essa vitória. Idempotente por
// natureza: só roda uma vez por vitória real (o próprio fluxo de
// combate já garante isso — não há retry desse passo), e o campo
// `status` da Caçada garante que uma segunda tentativa de contar a
// MESMA morte (ex.: dois requests concorrentes processando turnos do
// mesmo personagem) nunca acontece, porque o Character já está
// LOCK.UPDATE desde o início do turno em executarTurno — serializa
// qualquer segunda vitória concorrente do mesmo personagem.
async function registrarMorteDaCacada(character, inimigoAtual, transaction) {
  const idMonstro = inimigoAtual.id_monstro;
  if (!idMonstro) return null;

  const cacada = await CharacterAdventureHunt.findOne({
    where: { id_personagem: character.id, status: "Active", id_monstro: idMonstro },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!cacada) return null;

  const progresso = await obterOuCriarProgresso(character.id, transaction);
  await progresso.reload({ transaction, lock: transaction.LOCK.UPDATE });

  cacada.progress += 1;
  progresso.monsters_killed_in_hunts += 1;

  let concluida = false;
  if (cacada.progress >= cacada.quantity_required) {
    cacada.status = "Completed";
    cacada.completed_at = new Date();
    concluida = true;

    concederOuro(character, cacada.gold_reward_snapshot);
    progresso.reputation_points += cacada.reputation_reward_snapshot;
    progresso.hunts_completed_total += 1;
    const campoDificuldade = CONTADOR_POR_DIFICULDADE[cacada.difficulty];
    if (campoDificuldade) progresso[campoDificuldade] += 1;
  }

  await cacada.save({ transaction });
  await progresso.save({ transaction });

  return {
    huntId: cacada.id,
    progress: cacada.progress,
    quantityRequired: cacada.quantity_required,
    completed: concluida,
    goldReward: concluida ? cacada.gold_reward_snapshot : null,
    reputationReward: concluida ? cacada.reputation_reward_snapshot : null,
  };
}

module.exports = { resolverModificadorParaEncontro, registrarMorteDaCacada };
