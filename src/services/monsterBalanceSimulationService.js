// src/services/monsterBalanceSimulationService.js
//
// Admin Aventura — Editor de Balanceamento de Monstros por Resultado
// (§7). Simulador server-side ISOLADO de persistência de gameplay:
// roda combates inteiros em memória reaproveitando os mesmos resolvers
// reais (calcularDanoBasico/aplicarMitigacaoDeDefesa/
// resolverResultadoDeAcerto) e a mesma regra de dano do inimigo que
// combatController.executarTurno usa no contra-ataque — mas NUNCA chama
// serviço de XP/Gold/drop/missão/Bestiário/conquista/cooldown, nunca
// escreve Character/Inventory, e nunca é chamado pelo caminho normal de
// combate do jogador (§13 "não usar o simulador síncrono pesado no
// mesmo caminho de requests normais do jogador").
const combatController = require("../controllers/combatController");
const { calcularDanoBasico, aplicarMitigacaoDeDefesa, resolverResultadoDeAcerto, vidaMaximaDe } = require("./combatFormulas");
const { construirPerfilSintetico } = require("./monsterBalancePreviewService");
const {
  SIMULACAO_MAX_ITERACOES,
  SIMULACAO_MAX_TURNOS_POR_COMBATE,
  classificarDificuldade,
} = require("../config/monsterBalanceConfig");

// Um combate inteiro, do zero, só em memória. `snapshot` nunca é
// persistido nem compartilhado entre chamadas — cada simulação cria o
// seu próprio jogador/monstro sintéticos.
function simularUmCombate(nivel, multiplicadores, perfilChave) {
  const jogador = construirPerfilSintetico(nivel, perfilChave);
  jogador.vida_atual = vidaMaximaDe(jogador);

  // Mesma variação real de ±10% independente por stat que
  // combatController.gerarInimigo usa — reaproveitada, não copiada.
  const statsMonstro = combatController.statsFinaisDoMonstroPorNivel(
    nivel,
    multiplicadores,
    () => 0.9 + Math.random() * 0.2,
  );
  const monstro = {
    agilidade: statsMonstro.agilidade,
    velocidade: statsMonstro.velocidade,
    vida_atual: statsMonstro.vidaMaxima,
    dano_base: statsMonstro.danoBase,
  };

  let turnos = 0;
  let danoTotalMonstro = 0;
  let golpesJogador = 0;
  let esquivasDoMonstro = 0;

  // Ordem fixa (jogador ataca, monstro contra-ataca) — PvE solo não usa
  // Velocidade pra iniciativa hoje (ver AVISO_VELOCIDADE em
  // monsterBalancePreviewService.js); o simulador reproduz o motor
  // atual exatamente como ele é, não como poderia ser.
  while (turnos < SIMULACAO_MAX_TURNOS_POR_COMBATE && jogador.vida_atual > 0 && monstro.vida_atual > 0) {
    turnos += 1;

    golpesJogador += 1;
    const acertoJogador = resolverResultadoDeAcerto({ atacante: jogador, defensor: monstro });
    if (!acertoJogador.hit) {
      esquivasDoMonstro += 1;
    } else {
      const dano = aplicarMitigacaoDeDefesa(calcularDanoBasico(jogador), monstro);
      monstro.vida_atual = Math.max(0, monstro.vida_atual - dano);
    }

    if (monstro.vida_atual <= 0) break;

    const acertoMonstro = resolverResultadoDeAcerto({ atacante: monstro, defensor: jogador });
    if (acertoMonstro.hit) {
      // Mesma fórmula de dano do inimigo em executarTurno (ataque
      // básico): dano_base * variação ±15% independente, mitigado pela
      // defesa do alvo, piso de 1.
      const danoBruto = Math.max(1, Math.round(monstro.dano_base * (0.85 + Math.random() * 0.3)));
      const dano = Math.max(1, Math.round(aplicarMitigacaoDeDefesa(danoBruto, jogador)));
      jogador.vida_atual = Math.max(0, jogador.vida_atual - dano);
      danoTotalMonstro += dano;
    }
  }

  let vencedor = "timeout";
  if (jogador.vida_atual > 0 && monstro.vida_atual <= 0) vencedor = "jogador";
  else if (monstro.vida_atual > 0 && jogador.vida_atual <= 0) vencedor = "monstro";

  return {
    vencedor,
    turnos,
    vidaRestanteVencedor: vencedor === "jogador" ? jogador.vida_atual : vencedor === "monstro" ? monstro.vida_atual : null,
    danoTotalMonstro,
    golpesJogador,
    esquivasDoMonstro,
  };
}

function percentil(amostraOrdenada, fracao) {
  if (amostraOrdenada.length === 0) return 0;
  const indice = Math.min(amostraOrdenada.length - 1, Math.floor(amostraOrdenada.length * fracao));
  return amostraOrdenada[indice];
}

// Amostra de N combates independentes — nunca compartilha estado entre
// simulações concorrentes (cada chamada só usa variáveis locais desta
// função, então duas simulações simultâneas nunca podem interferir uma
// na outra — §14.2).
function simularCombates({ nivel, multiplicadores, perfilChave = "MEDIO", iteracoes = 100 }) {
  const total = Math.max(1, Math.min(SIMULACAO_MAX_ITERACOES, Math.round(Number(iteracoes)) || 100));

  let vitoriasJogador = 0;
  let vitoriasMonstro = 0;
  let timeouts = 0;
  let somaTurnos = 0;
  let somaDanoTotalMonstro = 0;
  let somaGolpesJogador = 0;
  let somaEsquivasDoMonstro = 0;
  let somaVidaRestanteVencedor = 0;
  let contagemVidaRestante = 0;
  const turnosAmostra = [];

  for (let i = 0; i < total; i += 1) {
    const resultado = simularUmCombate(nivel, multiplicadores, perfilChave);

    if (resultado.vencedor === "jogador") vitoriasJogador += 1;
    else if (resultado.vencedor === "monstro") vitoriasMonstro += 1;
    else timeouts += 1;

    somaTurnos += resultado.turnos;
    turnosAmostra.push(resultado.turnos);
    somaDanoTotalMonstro += resultado.danoTotalMonstro;
    somaGolpesJogador += resultado.golpesJogador;
    somaEsquivasDoMonstro += resultado.esquivasDoMonstro;
    if (resultado.vidaRestanteVencedor != null) {
      somaVidaRestanteVencedor += resultado.vidaRestanteVencedor;
      contagemVidaRestante += 1;
    }
  }

  turnosAmostra.sort((a, b) => a - b);
  const decisoes = vitoriasJogador + vitoriasMonstro;
  const taxaVitoriaJogador = decisoes > 0 ? vitoriasJogador / decisoes : 0;
  const taxaEsquivaObservada = somaGolpesJogador > 0 ? somaEsquivasDoMonstro / somaGolpesJogador : 0;

  return {
    totalCombates: total,
    vitoriasJogador,
    vitoriasMonstro,
    timeouts,
    taxaVitoriaJogadorPct: Math.round(taxaVitoriaJogador * 1000) / 10,
    turnosMedios: Math.round((somaTurnos / total) * 10) / 10,
    turnosMediana: percentil(turnosAmostra, 0.5),
    turnosP95: percentil(turnosAmostra, 0.95),
    vidaRestanteMediaVencedor: contagemVidaRestante > 0 ? Math.round(somaVidaRestanteVencedor / contagemVidaRestante) : null,
    danoTotalMonstroMedio: Math.round((somaDanoTotalMonstro / total) * 10) / 10,
    esquivaObservadaPct: Math.round(taxaEsquivaObservada * 1000) / 10,
    dificuldade: { ...classificarDificuldade(taxaVitoriaJogador), origem: "simulacao" },
  };
}

module.exports = { simularUmCombate, simularCombates };
