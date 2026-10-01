const Race = require("../models/Race");
const Class = require("../models/Class");
const { buscarBonusDeAtributos, personagemComBonus } = require("./equipmentBonusService");
const { comMultiplicadoresDeClasse, vidaMaximaDe, manaMaximaDe } = require("./combatFormulas");

const ATRIBUTOS_VALIDOS = [
"forca",
"vitalidade",
"agilidade",
"inteligencia",
"velocidade",
];

// Distribuição escolhida pelo jogador
async function distribuirPontos(personagem, atributo, quantidade, transaction) {
const pontosDisponiveis = personagem.pontos_distribuir || 0;

if (pontosDisponiveis <= 0) {
throw new Error("O personagem não possui pontos para distribuir.");
}

if (!ATRIBUTOS_VALIDOS.includes(atributo)) {
throw new Error("Atributo inválido.");
}

if (!Number.isInteger(quantidade) || quantidade <= 0) {
throw new Error("A quantidade de pontos deve ser um número inteiro maior que zero.");
}

if (quantidade > pontosDisponiveis) {
throw new Error("O personagem não possui pontos suficientes.");
}

personagem[atributo] += quantidade;
personagem.pontos_distribuir -= quantidade;

await personagem.save({ transaction });

return personagem;
}

// Distribuição aleatória
async function distribuirPontosAleatoriamente(personagem, transaction) {
const pontosDisponiveis = personagem.pontos_distribuir || 0;

if (pontosDisponiveis <= 0) {
throw new Error("O personagem não possui pontos para distribuir.");
}

for (let i = 0; i < pontosDisponiveis; i++) {
const atributoAleatorio =
ATRIBUTOS_VALIDOS[
Math.floor(Math.random() * ATRIBUTOS_VALIDOS.length)
];
personagem[atributoAleatorio] += 1;


}

personagem.pontos_distribuir = 0;

await personagem.save({ transaction });

return personagem;
}

// Poção de reset de atributos — nunca pode deixar um atributo abaixo do
// bônus BASE da raça (ex: raça com bonus_forca=5 nunca fica com força 0).
// Qualquer ponto acima desse piso é devolvido pra pontos_distribuir, o
// personagem não perde poder nenhum, só a liberdade de realocar — inclui
// de propósito pontos que vieram de Evolução de Natureza/Classe (também
// permanentes nas mesmas colunas, sem uma coluna separada pra distinguir
// "ponto livre" de "ponto de evolução"): vira ponto redistribuível, não é
// destruído.
async function resetarAtributos(personagem, transaction) {
  const raca = await Race.findByPk(personagem.id_raca, { transaction });
  if (!raca) {
    throw new Error("Raça do personagem não encontrada — não é possível calcular o piso de atributos.");
  }

  const piso = {
    forca: raca.bonus_forca ?? 0,
    vitalidade: raca.bonus_vitalidade ?? 0,
    agilidade: raca.bonus_agilidade ?? 0,
    inteligencia: raca.bonus_inteligencia ?? 0,
    velocidade: raca.bonus_velocidade ?? 0,
  };

  let pontosRecuperados = 0;
  for (const atributo of ATRIBUTOS_VALIDOS) {
    const atual = personagem[atributo] ?? 0;
    const minimo = piso[atributo];
    const diferenca = Math.max(0, atual - minimo);
    pontosRecuperados += diferenca;
    personagem[atributo] = minimo;
  }

  personagem.pontos_distribuir = (personagem.pontos_distribuir || 0) + pontosRecuperados;

  // vitalidade/inteligencia alimentam vida/mana MÁXIMA (combatFormulas) —
  // sem reclampar aqui, vida_atual podia sobrar acima do novo teto, igual
  // ao mesmo bug já corrigido no equip/unequip (CharacterEquipmentController
  // clamparVidaManaAoMaximo). Só reduz: resetar nunca cura de graça.
  const classe = personagem.id_classe ? await Class.findByPk(personagem.id_classe, { transaction }) : null;
  const bonus = await buscarBonusDeAtributos(personagem.id, transaction);
  const efetivo = comMultiplicadoresDeClasse(personagemComBonus(personagem.toJSON(), bonus), classe);
  const vidaMaxima = vidaMaximaDe(efetivo);
  const manaMaxima = manaMaximaDe(efetivo);
  personagem.vida_atual = Math.min(personagem.vida_atual, vidaMaxima);
  personagem.mana_atual = Math.min(personagem.mana_atual, manaMaxima);

  await personagem.save({ transaction });

  return { personagem, pontosRecuperados };
}

module.exports = {
distribuirPontos,
distribuirPontosAleatoriamente,
resetarAtributos,
};
