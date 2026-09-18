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
  custoManaEfetivo,
  aplicarMitigacaoDeDefesa,
  chanceDeEsquiva,
} = require("./combatFormulas");

// acao: { tipo: "attack" }, { tipo: "power", power: <Power> } ou
// { tipo: "item", item: <Item>, efeito: <ConsumableProperties> }. Quando
// o poder vem de buscarPoderesDoPersonagem (pvpController.js) ele já
// traz `power.nivel_habilidade` grudado — sem isso o duelo assíncrono e
// o PVP ao vivo ignorariam totalmente o nível investido na habilidade.
function aplicarAcao({ atacante, defensor, acao, vidaMaxAtacante, manaMaxAtacante }) {
  let dano = 0;
  let cura = 0;
  let manaCurada = 0;
  let esquivou = false;
  let nomeAcao = "Ataque básico";

  if (acao.tipo === "power" && acao.power) {
    const nivelHabilidade = acao.power.nivel_habilidade ?? 1;
    nomeAcao = acao.power.nome;
    atacante.mana_atual -= custoManaEfetivo(acao.power, nivelHabilidade);
    const efeito = calcularEfeitoPoder(acao.power, atacante, nivelHabilidade);
    dano = efeito.dano;
    cura = efeito.cura;
  } else if (acao.tipo === "item" && acao.efeito) {
    // Consumível como ação de duelo — consome o turno igual um ataque ou
    // poder (o oponente ainda age depois) e usa a MESMA fórmula percentual
    // (não pontos fixos) do PvE (combatController.js) e do uso fora de
    // combate (characterInventoryController.js): sempre % da vida/mana
    // MÁXIMA, nunca da atual.
    nomeAcao = acao.item?.nome ?? "Usar item";
    if (acao.efeito.efeito_vida) {
      cura = Math.round((vidaMaxAtacante ?? atacante.vida_atual) * (acao.efeito.efeito_vida / 100));
    }
    if (acao.efeito.efeito_mana) {
      manaCurada = Math.round((manaMaxAtacante ?? atacante.mana_atual) * (acao.efeito.efeito_mana / 100));
    }
  }

  if (dano > 0 || acao.tipo === "attack") {
    if (chanceDeEsquiva(defensor, atacante)) {
      esquivou = true;
      dano = 0;
    } else if (acao.tipo === "attack") {
      // Mitigação pela defesa do alvo — sem isso, equipar armadura não
      // tinha efeito nenhum no dano recebido (a defesa era somada em
      // equipmentBonusService.js mas nunca lida por nenhum código de
      // combate). Aplica tanto no ataque básico quanto em poder que causa
      // dano (branch abaixo), já que o jogo só tem um stat de defesa
      // (sem resistência mágica separada).
      dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(atacante), defensor);
      defensor.vida_atual = Math.max(0, defensor.vida_atual - dano);
    } else {
      dano = aplicarMitigacaoDeDefesa(dano, defensor);
      defensor.vida_atual = Math.max(0, defensor.vida_atual - dano);
    }
  }

  if (cura > 0) {
    const teto = vidaMaxAtacante ?? atacante.vida_atual + cura;
    atacante.vida_atual = Math.min(teto, atacante.vida_atual + cura);
  }

  if (manaCurada > 0) {
    const tetoMana = manaMaxAtacante ?? atacante.mana_atual + manaCurada;
    atacante.mana_atual = Math.min(tetoMana, atacante.mana_atual + manaCurada);
  }

  return { nomeAcao, dano, cura, manaCurada, esquivou };
}

module.exports = { aplicarAcao };
