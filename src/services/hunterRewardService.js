// Caçadas §9 — recompensa em ouro e Poder recomendado da oferta.
//
// Reformulação V2 dos Monstros (§7/§9.3) — a base econômica agora vem
// do ouro_recompensa FIXO e autoral do próprio AdventureMonster, nunca
// mais de uma fórmula por nível (ouroBaseDoNivel removida) nem de um
// multiplicador automático de Raro: se um Raro deve valer mais numa
// Caçada, o Admin já cadastra um ouro_recompensa maior nele mesmo.
// hpMultiplier/damageMultiplier da dificuldade continuam sendo
// modificadores CONTEXTUAIS aplicados só no cálculo do Poder
// recomendado (nunca persistidos em AdventureMonster).
const crypto = require("crypto");
const { calcularPoderMonstro } = require("../services/combatPowerService");

// §9 "basePerKill = valorEconomicoDoAlvo(targetMonster)" — ouro_recompensa
// já é o valor final, fixo e autoral do monstro.
function valorEconomicoDoAlvo({ ouroRecompensa }) {
  return ouroRecompensa ?? 0;
}

// §9 — randomFactor sorteado uma vez na CRIAÇÃO da oferta e salvo
// (random_factor_snapshot); refresh nunca pode mudar o ouro depois.
function sortearFatorAleatorio() {
  const PRECISAO = 1000;
  const minInt = Math.round(0.95 * PRECISAO);
  const maxInt = Math.round(1.05 * PRECISAO);
  return crypto.randomInt(minInt, maxInt + 1) / PRECISAO;
}

function calcularRecompensaOuro({ ouroRecompensa, quantidade, difficulty, randomFactor }) {
  const basePerKill = valorEconomicoDoAlvo({ ouroRecompensa });
  const baseHunt = basePerKill * quantidade;
  const difficultyReward = baseHunt * difficulty.rewardMultiplier;
  return Math.floor(difficultyReward * randomFactor);
}

// §9.1 — Poder recomendado é só informativo (nunca um gate). Usa os
// stats FIXOS de verdade do monstro (vida_maxima/dano_min/dano_max),
// aplica por cima só os modificadores contextuais da dificuldade da
// Caçada, e devolve o combatPower resultante.
function calcularPoderRecomendado({ vidaMaxima, danoMin, danoMax, difficulty }) {
  const danoMedio = ((danoMin ?? 0) + (danoMax ?? 0)) / 2;
  const vidaFinal = Math.round((vidaMaxima ?? 0) * (1 + difficulty.hpMultiplier));
  const danoFinal = Math.round(danoMedio * (1 + difficulty.damageMultiplier));

  return calcularPoderMonstro({ vida_maxima: vidaFinal, dano_base: danoFinal }).combatPower;
}

module.exports = {
  valorEconomicoDoAlvo,
  sortearFatorAleatorio,
  calcularRecompensaOuro,
  calcularPoderRecomendado,
};
