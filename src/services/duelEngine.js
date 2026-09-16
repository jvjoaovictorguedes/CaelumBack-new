// src/services/duelEngine.js
//
// Resolve UMA ação de duelo (ataque básico ou poder) sobre o estado de
// dois lutadores. Usado tanto pelo PVP assíncrono (pvpController, que
// escolhe a ação sozinho a cada turno) quanto pelo PVP ao vivo
// (pvpLiveSocket, onde é o jogador de verdade que escolhe a ação),
// pra garantir que os dois modos usem exatamente a mesma matemática.

const {
  calcularDanoBasico,
  calcularEfeitoPoder,
  chanceDeEsquiva,
} = require("./combatFormulas");

// acao: { tipo: "attack" } ou { tipo: "power", power: <Power> }
function aplicarAcao({ atacante, defensor, acao, vidaMaxAtacante }) {
  let dano = 0;
  let cura = 0;
  let esquivou = false;
  let nomeAcao = "Ataque básico";

  if (acao.tipo === "power" && acao.power) {
    nomeAcao = acao.power.nome;
    atacante.mana_atual -= acao.power.custo_mana;
    const efeito = calcularEfeitoPoder(acao.power, atacante);
    dano = efeito.dano;
    cura = efeito.cura;
  }

  if (dano > 0 || acao.tipo === "attack") {
    if (chanceDeEsquiva(defensor, atacante)) {
      esquivou = true;
      dano = 0;
    } else if (acao.tipo === "attack") {
      dano = calcularDanoBasico(atacante);
      defensor.vida_atual = Math.max(0, defensor.vida_atual - dano);
    } else {
      defensor.vida_atual = Math.max(0, defensor.vida_atual - dano);
    }
  }

  if (cura > 0) {
    const teto = vidaMaxAtacante ?? atacante.vida_atual + cura;
    atacante.vida_atual = Math.min(teto, atacante.vida_atual + cura);
  }

  return { nomeAcao, dano, cura, esquivou };
}

module.exports = { aplicarAcao };
