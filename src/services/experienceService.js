const Character = require("../models/Character");
const Class = require("../models/Class");
const {
  vidaMaximaDe,
  manaMaximaDe,
  comMultiplicadoresDeClasse,
} = require("./combatFormulas");
const { buscarBonusDeAtributos, personagemComBonus } = require("./equipmentBonusService");

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

// Subir de nível recalcula vida/mana máxima (vidaMaximaDe/manaMaximaDe
// já escalam por nível + classe) e enche vida_atual/mana_atual até lá
// — sem isso, o "escalamento por nível" só existia como um teto
// invisível: o jogador subia de nível e a vida/mana ATUAL (o que
// realmente é mostrado e usado em combate) continuava exatamente a
// mesma de antes, então parecia que nada tinha mudado.
if (novoNivel > nivelInicial) {
  const classe = character.Class ?? (await Class.findByPk(character.id_classe, { transaction }));
  const bonusEquipamento = await buscarBonusDeAtributos(character.id);
  const personagemEfetivo = comMultiplicadoresDeClasse(
    personagemComBonus(character.toJSON(), bonusEquipamento),
    classe,
  );
  character.vida_atual = vidaMaximaDe(personagemEfetivo);
  character.mana_atual = manaMaximaDe(personagemEfetivo);
  character.ultima_atualizacao_vida = new Date();
  character.ultima_atualizacao_mana = new Date();
}

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