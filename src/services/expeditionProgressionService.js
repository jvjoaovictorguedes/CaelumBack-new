// Progressão de profissão — nível é sempre DERIVADO do XP total
// acumulado (nunca armazenado/decrementado separadamente), via a
// tabela XP_TOTAL_PARA_NIVEL (ver expeditionConfig.js e seção 13 da
// especificação: "Preferencialmente armazenar XP acumulado total da
// profissão e calcular nível através de tabela/configuração, em vez
// de ficar zerando XP").
const {
  NIVEL_MAXIMO,
  XP_TOTAL_PARA_NIVEL,
  XP_POR_RESULTADO,
  MULTIPLICADOR_XP_POR_NIVEL,
} = require("../config/expeditionConfig");

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

// Aplica o ganho de XP de um resultado de coleta ("Nada" incluso) sobre
// o XP total já acumulado e retorna o novo estado + se houve level up.
// bonusPercentual (Buff Global "XpExpedicao", Fase 15) aplica DEPOIS do
// multiplicador por nível, nunca em cima dele — os dois são fatores
// independentes, não somados entre si.
function aplicarGanhoDeXp(xpTotalAtual, resultado, bonusPercentual = 0) {
  const nivelAntes = nivelPorXpTotal(xpTotalAtual);
  const base = XP_POR_RESULTADO[resultado] ?? 0;
  const multiplicador = MULTIPLICADOR_XP_POR_NIVEL[nivelAntes] ?? 1;
  let ganho = base > 0 ? Math.max(1, Math.round(base * multiplicador)) : 0;
  if (ganho > 0 && bonusPercentual > 0) {
    ganho = Math.round(ganho * (1 + bonusPercentual / 100));
  }
  const xpTotalNovo = xpTotalAtual + ganho;
  const nivelDepois = nivelPorXpTotal(xpTotalNovo);

  return {
    xpTotal: xpTotalNovo,
    xpGanho: ganho,
    nivelAntes,
    nivelDepois,
    subiuNivel: nivelDepois > nivelAntes,
    xpParaProximoNivel: xpParaProximoNivel(nivelDepois),
  };
}

module.exports = { nivelPorXpTotal, xpParaProximoNivel, aplicarGanhoDeXp };
