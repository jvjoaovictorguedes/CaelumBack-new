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

module.exports = { garantirPowerUsavelPorPersonagem };
