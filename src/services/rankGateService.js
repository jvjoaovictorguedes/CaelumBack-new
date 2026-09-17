// src/services/rankGateService.js
//
// Resolve o Portal de Ranque inteiro numa tacada só (mesmo padrão do
// duelo PvP assíncrono em pvpController.js — simula turno a turno no
// servidor e devolve o log pro front reproduzir), em vez de virar um
// combate interativo turno a turno como o PvE comum. O chefe tem stats
// FIXOS (nunca escala com quem tenta) — a dificuldade real é o jogador
// precisar chegar preparado o bastante pra vencer, não a UI do combate.
const {
  calcularDanoBasico,
  calcularEfeitoPoder,
  aplicarMitigacaoDeDefesa,
  chanceDeEsquiva,
  vidaMaximaDe,
  manaMaximaDe,
} = require("./combatFormulas");

const MAX_RODADAS = 30;

// Mesmo critério de escolha de ação do duelo assíncrono: usa o poder
// ofensivo mais forte que consegue pagar, senão ataca na unha.
function escolherAcaoJogador(estado, poderes) {
  const usaveis = poderes.filter(
    (p) => p.tipo_poder === "Ativo" && p.custo_mana <= estado.mana_atual && p.dano_base > 0,
  );
  if (usaveis.length === 0) return { tipo: "attack" };
  const escolhido = usaveis[Math.floor(Math.random() * usaveis.length)];
  return { tipo: "power", power: escolhido };
}

function simularPortal({ jogador, poderesJogador, chefe }) {
  const vidaMaxJogador = vidaMaximaDe(jogador);
  const manaMaxJogador = manaMaximaDe(jogador);
  const vidaMaxChefe = chefe.vida;

  const estadoJogador = { ...jogador, vida_atual: vidaMaxJogador, mana_atual: manaMaxJogador };
  // Chefe não usa poder nem mana — só ataque básico com os atributos
  // fixos cadastrados (ver RankGate). Sem arma_equipada: calcularDanoBasico
  // cai no fallback "desarmado" (4 + forca*0.9), que é o esperado pra uma
  // criatura sem inventário.
  const estadoChefe = { ...chefe, vida_atual: vidaMaxChefe, mana_atual: 0 };

  const log = [`Você entrou no portal e encontrou ${chefe.nome_chefe}!`];
  const turnos = [];

  function executarAcaoJogador() {
    const acao = escolherAcaoJogador(estadoJogador, poderesJogador);
    if (acao.tipo === "power") {
      estadoJogador.mana_atual -= acao.power.custo_mana;
      const { dano, cura } = calcularEfeitoPoder(acao.power, estadoJogador);
      if (dano > 0) {
        if (chanceDeEsquiva(estadoChefe, estadoJogador)) {
          log.push(`${chefe.nome_chefe} esquivou de ${acao.power.nome}!`);
        } else {
          const danoMitigado = aplicarMitigacaoDeDefesa(dano, estadoChefe);
          estadoChefe.vida_atual = Math.max(0, estadoChefe.vida_atual - danoMitigado);
          log.push(`Você usou ${acao.power.nome} e causou ${danoMitigado} de dano em ${chefe.nome_chefe}.`);
        }
      }
      if (cura > 0) {
        estadoJogador.vida_atual = Math.min(vidaMaxJogador, estadoJogador.vida_atual + cura);
        log.push(`Você usou ${acao.power.nome} e recuperou ${cura} de vida.`);
      }
    } else {
      if (chanceDeEsquiva(estadoChefe, estadoJogador)) {
        log.push(`${chefe.nome_chefe} esquivou do seu ataque!`);
      } else {
        const dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(estadoJogador), estadoChefe);
        estadoChefe.vida_atual = Math.max(0, estadoChefe.vida_atual - dano);
        log.push(`Você atacou e causou ${dano} de dano em ${chefe.nome_chefe}.`);
      }
    }
  }

  function executarAcaoChefe() {
    if (chanceDeEsquiva(estadoJogador, estadoChefe)) {
      log.push(`Você esquivou do ataque de ${chefe.nome_chefe}!`);
    } else {
      const dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(estadoChefe), estadoJogador);
      estadoJogador.vida_atual = Math.max(0, estadoJogador.vida_atual - dano);
      log.push(`${chefe.nome_chefe} atacou e causou ${dano} de dano em você.`);
    }
  }

  // Quem é mais rápido (velocidade) ataca primeiro a cada rodada —
  // mesmo critério do duelo PvP.
  const jogadorPrimeiro = estadoJogador.velocidade >= estadoChefe.velocidade;

  let rodada = 0;
  while (estadoJogador.vida_atual > 0 && estadoChefe.vida_atual > 0 && rodada < MAX_RODADAS) {
    if (jogadorPrimeiro) {
      executarAcaoJogador();
      if (estadoChefe.vida_atual <= 0) break;
      executarAcaoChefe();
    } else {
      executarAcaoChefe();
      if (estadoJogador.vida_atual <= 0) break;
      executarAcaoJogador();
    }
    turnos.push({
      rodada: rodada + 1,
      vidaJogador: estadoJogador.vida_atual,
      vidaChefe: estadoChefe.vida_atual,
    });
    rodada += 1;
  }

  const venceu = estadoChefe.vida_atual <= 0 && estadoJogador.vida_atual > 0;
  if (venceu) {
    log.push(`Você derrotou ${chefe.nome_chefe}!`);
  } else {
    log.push(`Você foi derrotado por ${chefe.nome_chefe}. Fique mais forte e tente de novo.`);
  }

  return { venceu, log, turnos, vidaJogadorRestante: Math.max(0, estadoJogador.vida_atual) };
}

module.exports = { simularPortal, MAX_RODADAS };
