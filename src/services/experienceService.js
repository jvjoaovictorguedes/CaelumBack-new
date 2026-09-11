const Character = require("../models/Character");

const XP_POR_NIVEL = 100;
const PONTOS_POR_NIVEL = 1;

async function adicionarExperiencia(characterId, quantidadeXP) {
  const character = await Character.findByPk(characterId);

  if (!character) {
    throw new Error("Personagem não encontrado.");
  }

  if (quantidadeXP <= 0) {
    throw new Error("A quantidade de XP deve ser maior que zero.");
  }

let novaExperiencia = character.experiencia + quantidadeXP;
let novoNivel = character.nivel;
let novosPontos = character.pontos_distribuir;

while (novaExperiencia >= novoNivel * XP_POR_NIVEL) {
  novaExperiencia -= novoNivel * XP_POR_NIVEL;

  novoNivel += 1;
  novosPontos += PONTOS_POR_NIVEL;
}

character.experiencia = novaExperiencia;
character.nivel = novoNivel;
character.pontos_distribuir = novosPontos;

await character.save();
}
module.exports = {
  adicionarExperiencia,
};