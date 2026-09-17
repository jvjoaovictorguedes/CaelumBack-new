const Character = require("../models/Character");

const XP_POR_NIVEL = 100;
const PONTOS_POR_NIVEL = 1;

// `transaction` + `personagem` (instância já travada com LOCK.UPDATE)
// existem pra permitir que o chamador junte XP, dinheiro e outros campos
// numa única transação/lock — sem isso, duas requisições concorrentes
// pro mesmo personagem (double-click, duas abas) podiam ler o mesmo
// saldo/XP antes de qualquer uma salvar e uma das duas recompensas se
// perdia (lost update).
async function adicionarExperiencia(characterId, quantidadeXP, { transaction, personagem } = {}) {
  const character =
    personagem ??
    (await Character.findByPk(
      characterId,
      transaction ? { transaction, lock: transaction.LOCK.UPDATE } : undefined,
    ));

  if (!character) {
    throw new Error("Personagem não encontrado.");
  }

  if (!Number.isFinite(quantidadeXP) || quantidadeXP <= 0) {
    throw new Error("A quantidade de XP deve ser maior que zero.");
  }

const nivelInicial = character.nivel;

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

await character.save({ transaction });

return {
  nivel: novoNivel,
  experiencia: novaExperiencia,
  pontos_distribuir: novosPontos,
  niveisGanhos: novoNivel - nivelInicial,
};
}
module.exports = {
  adicionarExperiencia,
};