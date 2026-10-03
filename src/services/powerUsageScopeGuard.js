// IA de Combate PvE & Habilidades de Monstros V1 (§4.1) — "Powers
// MONSTER não podem ser aprendidas via CharacterAbilities, Livro de
// Habilidade, Classe/Raça ou grant normal de personagem. A validação
// deve existir no serviço central de aprendizagem, não apenas no
// frontend." Não existe hoje um único ponto central que cria
// CharacterAbilities (6 call sites espalhados) — este guard é chamado em
// cada um deles, defesa em profundidade.
function erro(mensagem) {
  return Object.assign(new Error(mensagem), { statusCode: 400 });
}

function garantirPowerUsavelPorPersonagem(power) {
  if (power?.usage_scope === "MONSTER") {
    throw erro(
      `A Power "${power.nome ?? power.id}" é usage_scope MONSTER — não pode ser aprendida por personagem.`,
    );
  }
}

// Simétrico ao de cima — usado por monsterAbilityService/GuildBossAbility
// antes de vincular uma Power a um monstro/boss: usage_scope CHARACTER
// (o default de toda Power já existente) nunca pode virar habilidade de
// combate de criatura, senão toda Power de personagem viraria candidata
// a build de monstro sem o admin ter decidido isso de propósito.
function garantirPowerUsavelPorMonstro(power) {
  if (!power) {
    throw erro("Power não encontrada.");
  }
  if (power.usage_scope === "CHARACTER") {
    throw erro(
      `A Power "${power.nome ?? power.id}" é usage_scope CHARACTER — precisa ser MONSTER ou BOTH pra virar habilidade de monstro.`,
    );
  }
}

module.exports = { garantirPowerUsavelPorPersonagem, garantirPowerUsavelPorMonstro };
