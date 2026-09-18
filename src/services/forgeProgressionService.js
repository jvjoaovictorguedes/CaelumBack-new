// Progressão da Forja — mesmo critério do expeditionProgressionService.js:
// nível sempre DERIVADO do XP total acumulado (nunca decrementado/zerado).
const { NIVEL_MAXIMO, XP_TOTAL_PARA_NIVEL } = require("../config/forgeConfig");

function nivelPorXpTotal(xpTotal) {
  let nivel = 1;
  for (let candidato = 2; candidato <= NIVEL_MAXIMO; candidato += 1) {
    if (xpTotal >= XP_TOTAL_PARA_NIVEL[candidato]) {
      nivel = candidato;
    } else {
      break;
    }
  }
  return nivel;
}

function xpParaProximoNivel(nivelAtual) {
  if (nivelAtual >= NIVEL_MAXIMO) return null;
  return XP_TOTAL_PARA_NIVEL[nivelAtual + 1];
}

function aplicarGanhoDeXp(xpTotalAtual, ganho) {
  const nivelAntes = nivelPorXpTotal(xpTotalAtual);
  const xpTotalNovo = xpTotalAtual + Math.max(0, Math.round(ganho));
  const nivelDepois = nivelPorXpTotal(xpTotalNovo);
  return {
    xpTotal: xpTotalNovo,
    xpGanho: xpTotalNovo - xpTotalAtual,
    nivelAntes,
    nivelDepois,
    subiuNivel: nivelDepois > nivelAntes,
    xpParaProximoNivel: xpParaProximoNivel(nivelDepois),
  };
}

module.exports = { nivelPorXpTotal, xpParaProximoNivel, aplicarGanhoDeXp };
