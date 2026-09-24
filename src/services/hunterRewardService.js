// Caçadas §9 — recompensa em ouro e Poder recomendado da oferta.
// Reutiliza deliberadamente a MESMA fórmula de ouro que a Aventura já
// usa (ouroBaseDoNivel) e o MESMO cálculo de Poder de monstro que o
// resto do jogo usa (calcularPoderMonstro) — nunca uma escala paralela
// inventada só pra Caçadas (§9 "não usar um valor totalmente
// arbitrário").
const crypto = require("crypto");
const { ouroBaseDoNivel, MULTIPLICADOR_RARO_OURO } = require("../config/adventureConfig");
const { statsDeReferenciaPorNivel } = require("../controllers/combatController");
const { vidaMaximaDe, danoBasicoEsperado } = require("../services/combatFormulas");
const { calcularPoderMonstro } = require("../services/combatPowerService");

// §9 "basePerKill = valorEconomicoDoAlvo(targetMonster, zone)" — usa o
// nível de referência da zona (override do vínculo zona<->monstro, ou a
// faixa da própria zona) e o mesmo bônus de Raro que a Aventura já
// aplica (tipo_aparicao).
function valorEconomicoDoAlvo({ nivelReferencia, tipoAparicao }) {
  const base = ouroBaseDoNivel(nivelReferencia);
  return tipoAparicao === "Raro" ? base * MULTIPLICADOR_RARO_OURO : base;
}

// §9 — randomFactor sorteado uma vez na CRIAÇÃO da oferta e salvo
// (random_factor_snapshot); refresh nunca pode mudar o ouro depois.
function sortearFatorAleatorio() {
  const PRECISAO = 1000;
  const minInt = Math.round(0.95 * PRECISAO);
  const maxInt = Math.round(1.05 * PRECISAO);
  return crypto.randomInt(minInt, maxInt + 1) / PRECISAO;
}

function calcularRecompensaOuro({ nivelReferencia, tipoAparicao, quantidade, difficulty, randomFactor }) {
  const basePerKill = valorEconomicoDoAlvo({ nivelReferencia, tipoAparicao });
  const baseHunt = basePerKill * quantidade;
  const difficultyReward = baseHunt * difficulty.rewardMultiplier;
  return Math.floor(difficultyReward * randomFactor);
}

// §9.1 — Poder recomendado é só informativo (nunca um gate). Monta o
// mesmo "inimigo de referência" que o combate de verdade usaria pra
// esse nível (statsDeReferenciaPorNivel + fórmula fixa de
// vidaMaximaDe/danoBasicoEsperado — igual gerarInimigo faz), aplica os
// multiplicadores do próprio AdventureMonster e por cima os da
// dificuldade da Caçada, e devolve o combatPower resultante.
function calcularPoderRecomendado({ nivelReferencia, multiplicadoresMonstro, difficulty }) {
  const referencia = statsDeReferenciaPorNivel(nivelReferencia);
  const vidaBase = vidaMaximaDe(referencia) * (multiplicadoresMonstro?.vida ?? 1);
  const danoBase = danoBasicoEsperado(referencia) * (multiplicadoresMonstro?.dano ?? 1);

  const vidaFinal = Math.round(vidaBase * (1 + difficulty.hpMultiplier));
  const danoFinal = Math.round(danoBase * (1 + difficulty.damageMultiplier));

  return calcularPoderMonstro({ vida_maxima: vidaFinal, dano_base: danoFinal }).combatPower;
}

module.exports = {
  valorEconomicoDoAlvo,
  sortearFatorAleatorio,
  calcularRecompensaOuro,
  calcularPoderRecomendado,
};
